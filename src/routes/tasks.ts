import { Type, type Static } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginAsync } from 'fastify';
import {
  CallbackBodySchema,
  CreateTaskBodySchema,
  CreateTaskResponseSchema,
  ErrorResponseSchema,
  TaskSchema
} from '../lib/types.js';

const HealthSchema = Type.Object({ ok: Type.Boolean() });
const ParamsSchema = Type.Object({ taskId: Type.String() });

type Params = Static<typeof ParamsSchema>;

export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Health check',
      response: {
        200: HealthSchema
      }
    }
  }, async () => ({ ok: true }));

  app.post('/tasks', {
    schema: {
      tags: ['tasks'],
      summary: 'Create a ComfyUI task',
      body: CreateTaskBodySchema,
      response: {
        202: CreateTaskResponseSchema,
        400: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const created = fastify.taskService.createOrReuseTask(request.body);
    if (!created.reused) {
      fastify.worker.enqueue(created.task.taskId);
    }

    return reply.code(202).send({
      taskId: created.task.taskId,
      status: created.task.status
    });
  });

  app.get<{ Params: Params }>('/tasks/:taskId', {
    schema: {
      tags: ['tasks'],
      summary: 'Get task status',
      params: ParamsSchema,
      response: {
        200: TaskSchema,
        404: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const task = fastify.db.getTask(request.params.taskId);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'task not found' });
    }

    return task;
  });

  app.post<{ Params: Params }>('/callbacks/comfy/:taskId', {
    schema: {
      tags: ['callbacks'],
      summary: 'Optional callback endpoint for workflow-tail webhook nodes',
      params: ParamsSchema,
      body: CallbackBodySchema,
      response: {
        202: CreateTaskResponseSchema,
        404: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const task = fastify.db.getTask(request.params.taskId);
    if (!task) {
      return reply.code(404).send({ error: 'not_found', message: 'task not found' });
    }

    fastify.db.insertEvent(task.taskId, 'callback.received', request.body);
    fastify.db.updateTask(task.taskId, {
      status: 'notifying',
      result: {
        promptId: task.promptId,
        history: request.body.payload ?? request.body
      }
    });

    fastify.db.createOutbox(task.taskId, {
      taskId: task.taskId,
      sessionId: task.sessionId,
      channel: task.channel,
      replyTo: task.replyTo,
      status: request.body.status,
      result: request.body.payload ?? request.body
    });

    void fastify.worker.flushOutbox();

    return reply.code(202).send({ taskId: task.taskId, status: 'notifying' });
  });
};
