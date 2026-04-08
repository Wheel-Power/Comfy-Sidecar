import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { AppDb } from '../db.js';
import { ComfyClient } from './comfy-client.js';
import { ImNotifier, type NotificationPayload } from './notifier.js';
import type { TaskRecord } from './types.js';

export class TaskWorker {
  private readonly queue = new Set<string>();
  private readonly inFlight = new Set<string>();
  private outboxTimer?: NodeJS.Timeout;

  constructor(
    private readonly db: AppDb,
    private readonly config: AppConfig,
    private readonly comfy = new ComfyClient(config),
    private readonly notifier = new ImNotifier(config)
  ) {}

  start(): void {
    for (const task of this.db.listRecoverableTasks()) {
      this.enqueue(task.taskId);
    }

    this.outboxTimer = setInterval(() => {
      void this.flushOutbox();
    }, this.config.outboxPollMs);
    this.outboxTimer.unref?.();

    void this.pump();
  }

  stop(): void {
    if (this.outboxTimer) clearInterval(this.outboxTimer);
  }

  enqueue(taskId: string): void {
    if (this.queue.has(taskId) || this.inFlight.has(taskId)) return;
    this.queue.add(taskId);
    void this.pump();
  }

  async processTask(taskId: string): Promise<void> {
    const task = this.db.mustGetTask(taskId);
    if (isTerminal(task.status)) return;

    try {
      let currentTask = task;
      if (!currentTask.promptId) {
        currentTask = this.db.updateTask(taskId, { status: 'submitting' });
        this.db.insertEvent(taskId, 'submitting');

        const clientId = randomUUID();
        const submit = await this.comfy.submitPrompt(currentTask.workflowJson, clientId);

        currentTask = this.db.updateTask(taskId, {
          status: 'submitted',
          promptId: submit.promptId,
          clientId
        });
        this.db.insertEvent(taskId, 'submitted', submit);
      }

      currentTask = this.db.updateTask(taskId, { status: 'running' });
      this.db.insertEvent(taskId, 'running');

      const promptId = currentTask.promptId!;
      const clientId = currentTask.clientId ?? randomUUID();
      let wsTerminal: 'success' | 'error' | 'timeout' = 'timeout';

      if (this.config.enableWs) {
        try {
          wsTerminal = await this.comfy.watchPrompt(
            promptId,
            clientId,
            {
              onStart: async (data) => this.db.insertEvent(taskId, 'ws.execution_start', data),
              onExecuting: async (data) => this.db.insertEvent(taskId, 'ws.executing', data),
              onExecuted: async (data) => this.db.insertEvent(taskId, 'ws.executed', data),
              onProgress: async (data) => {
                const value = Number(data.value ?? 0);
                const max = Number(data.max ?? 0);
                const progress = max > 0 ? Math.min(99, Math.max(0, Math.round((value / max) * 100))) : 0;
                this.db.updateTask(taskId, { status: 'running', progress });
                this.db.insertEvent(taskId, 'ws.progress', data);
              },
              onSuccess: async (data) => this.db.insertEvent(taskId, 'ws.execution_success', data),
              onError: async (data) => this.db.insertEvent(taskId, 'ws.execution_error', data)
            },
            this.config.taskTimeoutMs
          );
        } catch (error) {
          this.db.insertEvent(taskId, 'ws.error', serializeError(error));
        }
      }

      if (wsTerminal === 'error') {
        this.db.updateTask(taskId, { status: 'execution_failed', error: 'ComfyUI execution failed' });
        return;
      }

      const history = await this.comfy.pollHistory(
        promptId,
        this.config.pollIntervalMs,
        this.config.pollMaxAttempts
      );

      const payload = this.buildNotificationPayload(this.db.mustGetTask(taskId), history);

      this.db.updateTask(taskId, {
        status: 'notifying',
        progress: 100,
        result: {
          promptId,
          history
        }
      });
      this.db.insertEvent(taskId, 'history.ready', history);
      this.db.createOutbox(taskId, payload);

      await this.flushOutbox();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /timed out/i.test(message) ? 'timed_out' : 'execution_failed';
      this.db.updateTask(taskId, { status, error: message });
      this.db.insertEvent(taskId, 'failed', serializeError(error));
    }
  }

  async flushOutbox(): Promise<void> {
    const items = this.db.listDispatchableOutbox(20);

    for (const item of items) {
      try {
        await this.notifier.send(item.payload as NotificationPayload);
        this.db.markOutboxSent(item.id);
        this.db.updateTask(item.taskId, { status: 'succeeded' });
        this.db.insertEvent(item.taskId, 'notify.sent');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const next = this.db.markOutboxRetry(item.id, message, this.config.outboxMaxRetries);
        this.db.insertEvent(item.taskId, 'notify.failed', serializeError(error));
        if (next.status === 'failed') {
          this.db.updateTask(item.taskId, { status: 'notify_failed', error: message });
        }
      }
    }
  }

  private async pump(): Promise<void> {
    while (this.inFlight.size < this.config.maxConcurrency) {
      const nextTaskId = this.queue.values().next().value as string | undefined;
      if (!nextTaskId) return;

      this.queue.delete(nextTaskId);
      this.inFlight.add(nextTaskId);

      void this.processTask(nextTaskId).finally(() => {
        this.inFlight.delete(nextTaskId);
        void this.pump();
      });
    }
  }

  private buildNotificationPayload(task: TaskRecord, history: Record<string, unknown>): NotificationPayload {
    return {
      taskId: task.taskId,
      sessionId: task.sessionId,
      channel: task.channel,
      replyTo: task.replyTo,
      status: 'succeeded',
      result: {
        promptId: task.promptId,
        history
      }
    };
  }
}

function isTerminal(status: TaskRecord['status']): boolean {
  return ['succeeded', 'submit_failed', 'execution_failed', 'notify_failed', 'timed_out', 'cancelled'].includes(status);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { message: String(error) };
}
