module.exports = {
  apps: [
    {
      name: 'comfy-bridge',
      script: 'dist/src/server.js',
      cwd: process.env.APP_DIR || __dirname,
      time: true,
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        HOST: process.env.HOST || '127.0.0.1',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
        DB_PATH: process.env.DB_PATH || './data/app.db',
        DATA_DIR: process.env.DATA_DIR || './data',
        MAX_CONCURRENCY: process.env.MAX_CONCURRENCY || '1',
        POLL_INTERVAL_MS: process.env.POLL_INTERVAL_MS || '2000',
        POLL_MAX_ATTEMPTS: process.env.POLL_MAX_ATTEMPTS || '180',
        TASK_TIMEOUT_MS: process.env.TASK_TIMEOUT_MS || '300000',
        OUTBOX_POLL_MS: process.env.OUTBOX_POLL_MS || '1000',
        OUTBOX_MAX_RETRIES: process.env.OUTBOX_MAX_RETRIES || '5',
        ENABLE_WS: process.env.ENABLE_WS || 'true',
        COMFY_BASE_URL: process.env.COMFY_BASE_URL || 'http://127.0.0.1:8188',
        COMFY_API_KEY: process.env.COMFY_API_KEY || '',
        IM_WEBHOOK_URL: process.env.IM_WEBHOOK_URL || '',
        IM_WEBHOOK_TOKEN: process.env.IM_WEBHOOK_TOKEN || ''
      }
    }
  ]
};
