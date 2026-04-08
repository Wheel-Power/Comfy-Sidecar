import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const app = await buildApp({ config: loadConfig(), startWorkers: false });
await app.ready();
process.stdout.write(JSON.stringify(app.swagger(), null, 2));
await app.close();
