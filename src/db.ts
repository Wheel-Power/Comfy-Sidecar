import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { CreateTaskBody, TaskRecord, TaskResult, TaskStatus } from './lib/types.js';

export interface OutboxRecord {
  id: number;
  taskId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'retry' | 'sent' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskRowSql {
  task_id: string;
  session_id: string;
  channel: string;
  reply_to: string;
  workflow: string;
  workflow_version: string | null;
  workflow_json: string;
  prompt_id: string | null;
  client_id: string | null;
  status: TaskStatus;
  progress: number;
  dedupe_key: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface OutboxRowSql {
  id: number;
  task_id: string;
  payload_json: string;
  status: 'pending' | 'retry' | 'sent' | 'failed';
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class AppDb {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        reply_to TEXT NOT NULL,
        workflow TEXT NOT NULL,
        workflow_version TEXT,
        workflow_json TEXT NOT NULL,
        prompt_id TEXT,
        client_id TEXT,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT NOT NULL,
        result_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(task_id)
      );
    `);
  }

  close(): void {
    this.sqlite.close();
  }

  createTask(input: CreateTaskBody, workflowJson: unknown, dedupeKey: string): TaskRecord {
    const taskId = randomUUID();
    const stmt = this.sqlite.prepare(`
      INSERT INTO tasks (
        task_id, session_id, channel, reply_to, workflow, workflow_version,
        workflow_json, status, progress, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?)
    `);

    stmt.run(
      taskId,
      input.sessionId,
      input.channel,
      input.replyTo,
      input.workflow,
      input.workflowVersion ?? null,
      JSON.stringify(workflowJson),
      dedupeKey
    );

    this.insertEvent(taskId, 'created', { input });
    return this.mustGetTask(taskId);
  }

  findActiveByDedupeKey(dedupeKey: string): TaskRecord | undefined {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM tasks WHERE dedupe_key = ? AND status IN (
          'queued', 'submitting', 'submitted', 'running', 'notifying'
        ) ORDER BY created_at DESC LIMIT 1`
      )
      .get(dedupeKey) as TaskRowSql | undefined;

    return row ? this.mapTask(row) : undefined;
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.sqlite
      .prepare('SELECT * FROM tasks WHERE task_id = ?')
      .get(taskId) as TaskRowSql | undefined;

    return row ? this.mapTask(row) : undefined;
  }

  mustGetTask(taskId: string): TaskRecord {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    return task;
  }

  listRecoverableTasks(): TaskRecord[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM tasks WHERE status IN ('queued', 'submitted', 'running', 'notifying') ORDER BY created_at ASC`
      )
      .all() as TaskRowSql[];

    return rows.map((row) => this.mapTask(row));
  }

  updateTask(taskId: string, patch: Partial<Omit<TaskRecord, 'taskId'>>): TaskRecord {
    const task = this.mustGetTask(taskId);

    const next: TaskRecord = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    this.sqlite
      .prepare(
        `UPDATE tasks SET
          session_id = ?,
          channel = ?,
          reply_to = ?,
          workflow = ?,
          workflow_version = ?,
          workflow_json = ?,
          prompt_id = ?,
          client_id = ?,
          status = ?,
          progress = ?,
          dedupe_key = ?,
          result_json = ?,
          error = ?,
          updated_at = ?
        WHERE task_id = ?`
      )
      .run(
        next.sessionId,
        next.channel,
        next.replyTo,
        next.workflow,
        next.workflowVersion ?? null,
        JSON.stringify(next.workflowJson),
        next.promptId ?? null,
        next.clientId ?? null,
        next.status,
        next.progress,
        next.dedupeKey,
        next.result ? JSON.stringify(next.result) : null,
        next.error ?? null,
        next.updatedAt,
        taskId
      );

    return this.mustGetTask(taskId);
  }

  insertEvent(taskId: string, eventType: string, payload?: unknown): void {
    this.sqlite
      .prepare('INSERT INTO task_events (task_id, event_type, payload_json) VALUES (?, ?, ?)')
      .run(taskId, eventType, payload ? JSON.stringify(payload) : null);
  }

  createOutbox(taskId: string, payload: Record<string, unknown>): number {
    const info = this.sqlite
      .prepare('INSERT INTO outbox (task_id, payload_json) VALUES (?, ?)')
      .run(taskId, JSON.stringify(payload));

    return Number(info.lastInsertRowid);
  }

  listDispatchableOutbox(limit = 10): OutboxRecord[] {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM outbox WHERE status IN ('pending', 'retry') ORDER BY created_at ASC LIMIT ?`
      )
      .all(limit) as OutboxRowSql[];

    return rows.map((row) => this.mapOutbox(row));
  }

  markOutboxSent(id: number): void {
    this.sqlite
      .prepare("UPDATE outbox SET status = 'sent', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  markOutboxRetry(id: number, error: string, maxRetries: number): OutboxRecord {
    const row = this.sqlite.prepare('SELECT * FROM outbox WHERE id = ?').get(id) as OutboxRowSql | undefined;
    if (!row) throw new Error(`outbox item not found: ${id}`);

    const retryCount = row.retry_count + 1;
    const nextStatus: OutboxRowSql['status'] = retryCount >= maxRetries ? 'failed' : 'retry';

    this.sqlite
      .prepare(
        'UPDATE outbox SET status = ?, retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?'
      )
      .run(nextStatus, retryCount, error, new Date().toISOString(), id);

    return this.listDispatchableOutbox(maxRetries + 100).find((item) => item.id === id) ?? this.mapOutbox({
      ...row,
      status: nextStatus,
      retry_count: retryCount,
      last_error: error,
      updated_at: new Date().toISOString()
    });
  }

  private mapTask(row: TaskRowSql): TaskRecord {
    const result = row.result_json ? (JSON.parse(row.result_json) as TaskResult) : undefined;
    return {
      taskId: row.task_id,
      sessionId: row.session_id,
      channel: row.channel,
      replyTo: row.reply_to,
      workflow: row.workflow,
      workflowVersion: row.workflow_version ?? undefined,
      workflowJson: JSON.parse(row.workflow_json),
      promptId: row.prompt_id ?? undefined,
      clientId: row.client_id ?? undefined,
      status: row.status,
      progress: row.progress,
      dedupeKey: row.dedupe_key,
      result,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapOutbox(row: OutboxRowSql): OutboxRecord {
    return {
      id: row.id,
      taskId: row.task_id,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
