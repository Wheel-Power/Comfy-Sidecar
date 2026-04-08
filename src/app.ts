import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { AppConfig } from './config.js';
import { AppDb } from './db.js';
import { TaskService } from './lib/task-service.js';
import { TaskWorker } from './lib/worker.js';
import { tasksRoutes } from './routes/tasks.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: AppDb;
    taskService: TaskService;
    worker: TaskWorker;
  }
}

export interface BuildAppOptions {
  config: AppConfig;
  startWorkers?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const db = new AppDb(options.config.dbPath);
  const taskService = new TaskService(db);
  const worker = new TaskWorker(db, options.config);

  const app = Fastify({
    logger: {
      level: options.config.logLevel
    }
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.decorate('config', options.config);
  app.decorate('db', db);
  app.decorate('taskService', taskService);
  app.decorate('worker', worker);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'comfy-bridge-node',
        version: '0.1.0'
      },
      tags: [
        { name: 'system', description: 'System endpoints' },
        { name: 'tasks', description: 'Task endpoints' },
        { name: 'callbacks', description: 'Callback endpoints' }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs'
  });

  await app.register(tasksRoutes);

  app.addHook('onClose', async () => {
    worker.stop();
    db.close();
  });

  if (options.startWorkers !== false) {
    worker.start();
  }

  return app;
}
