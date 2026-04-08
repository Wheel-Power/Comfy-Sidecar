# comfy-sidecar

一个轻量、本地优先的 **ComfyUI sidecar**：

- OpenClaw / IM 入口只负责接单与回消息
- 这个服务负责 `POST /tasks`、异步提交 ComfyUI、跟踪任务、完成后回推 IM
- 不依赖 Redis / MQ / Postgres
- 持久化只用 **SQLite + 本地文件夹**
- API 使用 **Fastify + TypeBox**
- 自动导出 **OpenAPI**
- 测试使用 **node:test + fastify.inject() + undici MockAgent**

## 主要特性

- `POST /tasks` 创建任务
- `GET /tasks/:taskId` 查询任务状态
- `POST /callbacks/comfy/:taskId` 预留给工作流末尾 webhook 节点
- 主链路：`/prompt` -> `/ws` -> `/history`
- 兜底：`/history` 轮询
- 结果通知：通过 `IM_WEBHOOK_URL` 发回 OpenClaw / IM 适配层
- 启动恢复：自动恢复 `queued / submitted / running / notifying` 状态任务

## 快速开始

```bash
cp .env.example .env
npm install
npm run dev
```

服务默认运行在 `http://127.0.0.1:3000`。

### 生成 OpenAPI

```bash
npm run openapi:build
npm run openapi:types
```

### 运行测试

```bash
npm test
```

## 目录结构

```text
src/
  app.ts
  server.ts
  openapi.ts
  config.ts
  db.ts
  routes/
    tasks.ts
  lib/
    comfy-client.ts
    notifier.ts
    task-service.ts
    worker.ts
    types.ts
test/
  tasks.test.ts
```

## IM webhook 负载示例

当任务完成后，会向 `IM_WEBHOOK_URL` POST：

```json
{
  "taskId": "task_xxx",
  "sessionId": "sess_xxx",
  "channel": "telegram",
  "replyTo": "msg_xxx",
  "status": "succeeded",
  "result": {
    "promptId": "1234-5678",
    "history": {
      "outputs": {}
    }
  }
}
```

你可以让这个 webhook 指向：

- 你自己的 OpenClaw tool endpoint
- 一个本地 IM adapter
- 任意能把结果发回原会话的服务

## 备注

- 这个脚手架默认把依赖版本设为 `latest`，方便你在本地直接拉最新包。
- 如果你准备长期维护，建议安装后锁定 `package-lock.json`。
- 这里的结果下载/对象存储没有做重实现，只保留了最小 history + webhook 主流程；你可以在 `src/lib/worker.ts` 的 `buildNotificationPayload()` 里扩展 `/view` 下载与附件上传。
