import { createHash } from 'node:crypto';
import type { AppDb } from '../db.js';
import type { CreateTaskBody, TaskRecord } from './types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(',')}}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildDedupeKey(input: CreateTaskBody): string {
  const normalized = stableStringify(input.inputs);
  return sha256([
    input.sessionId,
    input.replyTo,
    input.workflow,
    input.workflowVersion ?? '',
    normalized
  ].join(':'));
}

export function buildWorkflowJson(input: CreateTaskBody): unknown {
  if (input.workflowJson) return input.workflowJson;

  return {
    meta: {
      workflow: input.workflow,
      workflowVersion: input.workflowVersion ?? 'v1'
    },
    inputs: input.inputs
  };
}

export class TaskService {
  constructor(private readonly db: AppDb) {}

  createOrReuseTask(input: CreateTaskBody): { task: TaskRecord; reused: boolean } {
    const dedupeKey = input.idempotencyKey ?? buildDedupeKey(input);
    const existing = this.db.findActiveByDedupeKey(dedupeKey);
    if (existing) {
      return { task: existing, reused: true };
    }

    const workflowJson = buildWorkflowJson(input);
    const task = this.db.createTask(input, workflowJson, dedupeKey);
    return { task, reused: false };
  }
}
