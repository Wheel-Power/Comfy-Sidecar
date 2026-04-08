import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  dbPath: string;
  dataDir: string;
  maxConcurrency: number;
  pollIntervalMs: number;
  pollMaxAttempts: number;
  taskTimeoutMs: number;
  outboxPollMs: number;
  outboxMaxRetries: number;
  enableWs: boolean;
  comfyBaseUrl: string;
  comfyApiKey?: string;
  imWebhookUrl?: string;
  imWebhookToken?: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = resolve(overrides.dataDir ?? process.env.DATA_DIR ?? './data');
  const dbPath = resolve(overrides.dbPath ?? process.env.DB_PATH ?? `${dataDir}/app.db`);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(dirname(dbPath), { recursive: true });

  return {
    port: overrides.port ?? envInt('PORT', 3000),
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    logLevel: overrides.logLevel ?? process.env.LOG_LEVEL ?? 'info',
    dbPath,
    dataDir,
    maxConcurrency: overrides.maxConcurrency ?? envInt('MAX_CONCURRENCY', 1),
    pollIntervalMs: overrides.pollIntervalMs ?? envInt('POLL_INTERVAL_MS', 2000),
    pollMaxAttempts: overrides.pollMaxAttempts ?? envInt('POLL_MAX_ATTEMPTS', 180),
    taskTimeoutMs: overrides.taskTimeoutMs ?? envInt('TASK_TIMEOUT_MS', 300_000),
    outboxPollMs: overrides.outboxPollMs ?? envInt('OUTBOX_POLL_MS', 1000),
    outboxMaxRetries: overrides.outboxMaxRetries ?? envInt('OUTBOX_MAX_RETRIES', 5),
    enableWs: overrides.enableWs ?? envBool('ENABLE_WS', true),
    comfyBaseUrl: overrides.comfyBaseUrl ?? process.env.COMFY_BASE_URL ?? 'http://127.0.0.1:8188',
    comfyApiKey: overrides.comfyApiKey ?? process.env.COMFY_API_KEY,
    imWebhookUrl: overrides.imWebhookUrl ?? process.env.IM_WEBHOOK_URL,
    imWebhookToken: overrides.imWebhookToken ?? process.env.IM_WEBHOOK_TOKEN
  };
}
