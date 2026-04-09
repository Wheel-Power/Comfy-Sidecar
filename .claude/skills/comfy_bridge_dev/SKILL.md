---
name: comfy_bridge_dev
description: Use this skill when working on the local comfy-bridge Node service, especially for starting the app, checking health, testing task routes, validating env configuration, and inspecting PM2/runtime behavior.
---

# Purpose
This skill helps operate and validate the local comfy-bridge service without introducing heavy infrastructure changes.

## Use this skill when
- The user asks to start, stop, restart, or verify the local comfy-bridge service
- The user wants to test `/health`, `/tasks`, callbacks, or IM push flow
- The user mentions PM2, `.env`, SQLite path, ComfyUI URL, or local deployment issues
- The user wants a quick smoke test of the service

## Do not use this skill when
- The request is only about code refactoring with no runtime validation
- The request is about general Node.js theory unrelated to this project
- The user wants major architecture changes without touching this service

## Project assumptions
- Service runs locally with Node.js 20+
- PM2 is the preferred runtime manager
- SQLite is persisted to disk
- ComfyUI is configured via `COMFY_BASE_URL`
- Health endpoint should be checked before deeper diagnosis

## Preferred workflow
1. Read `.env` or active PM2 env if relevant
2. Check service health first
3. If service is down, inspect PM2 status/logs
4. If route behavior is in question, run a minimal request against the local API
5. Only then suggest code/config changes

## Safe operational checks
### Health check
Use:
`curl -s http://127.0.0.1:3000/health`

### Start with PM2
Use:
`pm2 start ecosystem.comfy-bridge.config.cjs`

### Restart with PM2
Use:
`pm2 restart comfy-bridge`

### View logs
Use:
`pm2 logs comfy-bridge --lines 100`

### Check process state
Use:
`pm2 status`

## Task API smoke tests
### Create a task
Use a minimal JSON body and prefer localhost:
`curl -s -X POST http://127.0.0.1:3000/tasks -H 'content-type: application/json' -d '{...}'`

### Inspect a task
`curl -s http://127.0.0.1:3000/tasks/<taskId>`

## Diagnostic guidance
- If health fails, inspect PM2 first
- If PM2 is online but requests fail, verify `PORT`, `HOST`, and route bindings
- If task submission fails, verify `COMFY_BASE_URL`
- If persistence is missing after restart, verify `DB_PATH` and whether the SQLite file is on disk
- If result push fails, inspect the IM webhook configuration

## Boundaries
- Do not add Redis, Kafka, RabbitMQ, or Postgres as a first response
- Do not replace SQLite unless the user explicitly asks
- Do not change public endpoint names casually
- Prefer minimal reproducible checks before larger edits

## Definition of done
A task is complete when:
- The service is healthy or the failure is clearly localized
- The likely root cause is identified
- The user has exact next commands to run
- Any config changes are reflected in docs or `.env.example` if needed
