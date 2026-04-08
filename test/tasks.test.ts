import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { TaskService } from '../src/lib/task-service.js';
import { AppDb } from '../src/db.js';
import { TaskWorker } from '../src/lib/worker.js';

const previousDispatcher = getGlobalDispatcher();
const mockAgent = new MockAgent();

before(() => {
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

after(async () => {
  setGlobalDispatcher(previousDispatcher);
  await mockAgent.close();
});

describe('tasks routes', () => {
  let dir = '';

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('creates a task via POST /tasks', async () => {
    dir = mkdtempSync(join(tmpdir(), 'comfy-bridge-route-'));
    const config = createTestConfig(dir, { enableWs: false });
    const app = await buildApp({ config, startWorkers: false });

    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: {
        sessionId: 'sess_1',
        channel: 'telegram',
        replyTo: 'msg_1',
        workflow: 'txt2img-v1',
        inputs: {
          prompt: 'hello'
        }
      }
    });

    assert.equal(response.statusCode, 202);
    const body = response.json() as { taskId: string; status: string };
    assert.equal(body.status, 'queued');

    const task = app.db.getTask(body.taskId);
    assert.ok(task);
    assert.equal(task?.workflow, 'txt2img-v1');

    await app.close();
  });
});

describe('worker', () => {
  let dir = '';

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('submits to ComfyUI, polls history, and notifies IM webhook', async () => {
    dir = mkdtempSync(join(tmpdir(), 'comfy-bridge-worker-'));
    const config = createTestConfig(dir, {
      enableWs: false,
      imWebhookUrl: 'http://im.local/webhook'
    });

    const comfyPool = mockAgent.get('http://comfy.local');
    comfyPool
      .intercept({ path: '/prompt', method: 'POST' })
      .reply(200, { prompt_id: 'prompt-123', number: 1 });

    comfyPool
      .intercept({ path: '/history/prompt-123', method: 'GET' })
      .reply(200, {
        'prompt-123': {
          outputs: {
            save_image: {
              images: [
                {
                  filename: 'test.png',
                  subfolder: '',
                  type: 'output'
                }
              ]
            }
          }
        }
      });

    const imPool = mockAgent.get('http://im.local');
    imPool
      .intercept({ path: '/webhook', method: 'POST' })
      .reply(200, { ok: true });

    const db = new AppDb(config.dbPath);
    const service = new TaskService(db);
    const worker = new TaskWorker(db, config);

    const created = service.createOrReuseTask({
      sessionId: 'sess_2',
      channel: 'telegram',
      replyTo: 'msg_2',
      workflow: 'txt2img-v1',
      inputs: {
        prompt: 'cyberpunk city'
      }
    });

    await worker.processTask(created.task.taskId);

    const task = db.mustGetTask(created.task.taskId);
    assert.equal(task.status, 'succeeded');
    assert.equal(task.promptId, 'prompt-123');
    assert.equal(task.result?.promptId, 'prompt-123');
    const outboxSent = db.sqlite
      .prepare("SELECT COUNT(*) as count FROM outbox WHERE status = 'sent'")
      .get() as { count: number };
    assert.equal(outboxSent.count, 1);

    worker.stop();
    db.close();
  });
});

function createTestConfig(dir: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return loadConfig({
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    dataDir: dir,
    dbPath: join(dir, 'app.db'),
    comfyBaseUrl: 'http://comfy.local',
    pollIntervalMs: 1,
    pollMaxAttempts: 2,
    taskTimeoutMs: 1000,
    outboxPollMs: 100,
    outboxMaxRetries: 2,
    maxConcurrency: 1,
    ...overrides
  });
}
