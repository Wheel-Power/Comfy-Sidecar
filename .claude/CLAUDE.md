# CLAUDE.md

## Project overview
This project is a local Node.js sidecar for submitting ComfyUI jobs, tracking execution, and pushing results back to IM integrations.
It is intentionally lightweight:
- Fastify HTTP server
- TypeScript + ESM
- SQLite for persistence
- Local filesystem for task artifacts
- PM2 for process management

## Primary goals
- Keep deployment local and simple
- Avoid heavy middleware such as Redis, Kafka, RabbitMQ, and Postgres
- Preserve task durability across restarts
- Prefer clear code over abstraction-heavy patterns

## Architecture
- `src/server.ts`: app bootstrap
- `src/routes/*`: HTTP routes
- `src/lib/comfy-client.ts`: ComfyUI API client
- `src/db/*`: SQLite access
- `src/services/*`: task orchestration, polling, callbacks, IM push
- `test/*`: node:test-based tests

## Runtime assumptions
- Node.js 20+
- SQLite file is persisted on disk
- ComfyUI base URL comes from `COMFY_BASE_URL`
- Database path comes from `DB_PATH`
- PM2 is the default production process manager

## Development commands
- install: `npm install`
- dev: `npm run dev`
- build: `npm run build`
- start: `npm start`
- test: `npm test`
- coverage: `npm run test:coverage`
- openapi: `npm run openapi:build && npm run openapi:types`

## Coding preferences
- Use TypeScript types from route schemas where possible
- Prefer schema-driven Fastify routes over handwritten request typings
- Keep functions small and side effects explicit
- Avoid introducing new infrastructure dependencies unless clearly necessary
- Keep the HTTP layer thin and move orchestration into services

## Fastify conventions
- Prefer TypeBox schema inference over manual route generics
- Validate all external input at route boundaries
- Return stable JSON response shapes
- Keep route handlers focused on request/response flow

## Database conventions
- SQLite is the source of truth for task state
- Do not switch to in-memory SQLite unless explicitly requested
- Preserve WAL mode unless there is a concrete reason to change it
- Use migrations or explicit init SQL rather than implicit schema drift

## Task orchestration rules
- Job creation must be idempotent where practical
- Prefer WebSocket status tracking first, polling second
- Persist important state transitions before sending outbound notifications
- Download artifacts before notifying IM integrations
- Notification sending must be retry-safe

## Testing expectations
- Use `node:test`
- Prefer `fastify.inject()` for route tests
- Mock outbound HTTP rather than requiring live ComfyUI in most tests
- Add at least one happy-path test and one failure-path test for route changes

## When making changes
- Do not rename public endpoints unless requested
- Do not silently change env var names
- Do not add heavy frameworks or ORMs without a strong reason
- Update tests when changing route contracts or task flow
- If OpenAPI schemas change, regenerate types

## Review checklist
Before finishing:
1. `npm run build`
2. `npm test`
3. If route schemas changed, regenerate OpenAPI/types
4. If env vars changed, update `.env.example`
5. If PM2 behavior changed, update startup docs
