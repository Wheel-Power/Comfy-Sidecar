import { Static, Type } from '@sinclair/typebox';

export const TaskStatuses = [
  'queued',
  'submitting',
  'submitted',
  'running',
  'notifying',
  'succeeded',
  'submit_failed',
  'execution_failed',
  'notify_failed',
  'timed_out',
  'cancelled'
] as const;

export type TaskStatus = (typeof TaskStatuses)[number];

export const TaskStatusSchema = Type.Unsafe<TaskStatus>({ type: 'string', enum: [...TaskStatuses] });

export const TaskResultSchema = Type.Object(
  {
    promptId: Type.Optional(Type.String()),
    history: Type.Optional(Type.Unknown())
  },
  { additionalProperties: true }
);

export const CreateTaskBodySchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
  channel: Type.String({ minLength: 1 }),
  replyTo: Type.String({ minLength: 1 }),
  workflow: Type.String({ minLength: 1 }),
  workflowVersion: Type.Optional(Type.String()),
  inputs: Type.Record(Type.String(), Type.Any()),
  workflowJson: Type.Optional(Type.Unknown()),
  idempotencyKey: Type.Optional(Type.String())
});

export const TaskSchema = Type.Object({
  taskId: Type.String(),
  sessionId: Type.String(),
  channel: Type.String(),
  replyTo: Type.String(),
  workflow: Type.String(),
  workflowVersion: Type.Optional(Type.String()),
  workflowJson: Type.Unknown(),
  promptId: Type.Optional(Type.String()),
  clientId: Type.Optional(Type.String()),
  status: TaskStatusSchema,
  progress: Type.Integer({ minimum: 0, maximum: 100 }),
  dedupeKey: Type.String(),
  result: Type.Optional(TaskResultSchema),
  error: Type.Optional(Type.String()),
  createdAt: Type.String(),
  updatedAt: Type.String()
});

export const CreateTaskResponseSchema = Type.Object({
  taskId: Type.String(),
  status: TaskStatusSchema
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  message: Type.String()
});

export const CallbackBodySchema = Type.Object(
  {
    status: Type.String(),
    payload: Type.Optional(Type.Unknown())
  },
  { additionalProperties: true }
);

export type CreateTaskBody = Static<typeof CreateTaskBodySchema>;
export type TaskResult = Static<typeof TaskResultSchema>;
export type TaskRecord = Static<typeof TaskSchema>;
