---
name: comfy_bridge
description: Use the local comfy-bridge sidecar to create ComfyUI tasks, check task status, and report results back to the user.
metadata:
  openclaw:
    requires:
      bins: ["curl"]
---

# comfy_bridge

Use this skill when the user wants you to:
- submit a local ComfyUI generation job through the sidecar service
- check the status of an existing ComfyUI task by `taskId`
- retry or inspect a previously created local ComfyUI task

Do **not** use this skill for purely conceptual questions, architecture discussions, or code review. Use it only when you actually need to call the running local service.

## Service assumptions

- Default base URL: `http://127.0.0.1:3000`
- If the environment variable `COMFY_BRIDGE_BASE_URL` is set, use that instead.
- The local sidecar is expected to expose:
  - `GET /health`
  - `POST /tasks`
  - `GET /tasks/:taskId`

## Safety rules

When using `exec`, never interpolate raw user text directly into shell command arguments.

Always:
1. write JSON request bodies into a temporary file with a **single-quoted heredoc**
2. send the body with `curl --data-binary @file`
3. keep the shell command ASCII-only

This avoids shell injection and broken quoting.

## First call in a session

Before the first task call in a session, verify the service is up:

```bash
BASE_URL="${COMFY_BRIDGE_BASE_URL:-http://127.0.0.1:3000}"
curl -fsS "$BASE_URL/health"
```

If the health check fails, tell the user the local comfy-bridge service is not reachable and ask them to start it.

## Creating a task

Use `POST /tasks` when the user asks you to generate, render, queue, or run a ComfyUI workflow.

Request body shape:

```json
{
  "sessionId": "openclaw-local",
  "channel": "openclaw",
  "replyTo": "turn-<unique>",
  "workflow": "txt2img-v1",
  "workflowVersion": "optional",
  "inputs": {
    "prompt": "user prompt"
  },
  "idempotencyKey": "optional-stable-key"
}
```

### Field guidance

- `sessionId`: use a stable current-session identifier if one is available in context; otherwise use `openclaw-local`
- `channel`: use the current channel name if known; otherwise use `openclaw`
- `replyTo`: use the source message id if available; otherwise synthesize a readable value such as `turn-<timestamp>`
- `workflow`: choose the user's requested workflow preset, for example `txt2img-v1`, `img2img-v1`, or another preset defined by the local service
- `inputs`: include only the parameters the workflow needs; preserve the user prompt faithfully
- `idempotencyKey`: when you have a stable message id, use a deterministic key so repeated submissions do not create duplicate tasks

### Safe submission template

```bash
set -e
BASE_URL="${COMFY_BRIDGE_BASE_URL:-http://127.0.0.1:3000}"
REQ_FILE="$(mktemp)"
cat > "$REQ_FILE" <<'JSON'
{
  "sessionId": "openclaw-local",
  "channel": "openclaw",
  "replyTo": "turn-REPLACE_ME",
  "workflow": "txt2img-v1",
  "inputs": {
    "prompt": "REPLACE_ME"
  },
  "idempotencyKey": "optional-stable-key"
}
JSON
curl -fsS -X POST \
  -H 'content-type: application/json' \
  --data-binary @"$REQ_FILE" \
  "$BASE_URL/tasks"
rm -f "$REQ_FILE"
```

After submission:
- read the returned JSON
- extract `taskId` and `status`
- tell the user the task was queued or started
- if the service itself will push results back to IM, say that the result will be sent back when ready

## Checking task status

When the user gives a `taskId`, or asks for progress on a task you just created, use:

```bash
BASE_URL="${COMFY_BRIDGE_BASE_URL:-http://127.0.0.1:3000}"
curl -fsS "$BASE_URL/tasks/TASK_ID"
```

Interpret these states as follows:
- in progress: `queued`, `submitting`, `submitted`, `running`, `rendering_outputs`, `uploading_assets`, `notifying`
- terminal success: `succeeded`
- terminal failure: `submit_failed`, `execution_failed`, `download_failed`, `upload_failed`, `notify_failed`, `timed_out`, `cancelled`

If the task is still running, report the current status and any `progress` value if present.
If the task succeeded, summarize the result and include any returned result metadata.
If the task failed, surface the error concisely.

## Polling guidance

Use light polling only when the user explicitly wants you to wait for progress in the current turn.

Rules:
- poll at most 3 times in one turn
- sleep 2 to 5 seconds between polls
- stop immediately on any terminal state
- do not keep polling if the service is already configured to push results back to IM

Example:

```bash
BASE_URL="${COMFY_BRIDGE_BASE_URL:-http://127.0.0.1:3000}"
for i in 1 2 3; do
  curl -fsS "$BASE_URL/tasks/TASK_ID"
  sleep 3
done
```

## Response style

When reporting back to the user:
- be explicit about whether you created a new task or reused an existing one
- include `taskId` whenever useful for follow-up
- keep status summaries short and concrete
- mention that the local sidecar, not the agent, is responsible for the async callback to IM

## Failure handling

If `POST /tasks` or `GET /tasks/:taskId` returns a non-2xx response:
- report the HTTP failure briefly
- do not guess missing data
- suggest checking whether the local service is running and whether `COMFY_BRIDGE_BASE_URL` is correct
