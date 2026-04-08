import WebSocket from 'ws';
import type { AppConfig } from '../config.js';

export interface PromptSubmitResult {
  promptId: string;
  number?: number;
}

export interface WsEventHandlers {
  onStart?: (data: unknown) => Promise<void> | void;
  onProgress?: (data: { value?: number; max?: number } & Record<string, unknown>) => Promise<void> | void;
  onExecuting?: (data: unknown) => Promise<void> | void;
  onExecuted?: (data: unknown) => Promise<void> | void;
  onSuccess?: (data: unknown) => Promise<void> | void;
  onError?: (data: unknown) => Promise<void> | void;
}

export class ComfyClient {
  constructor(private readonly config: AppConfig) {}

  async submitPrompt(prompt: unknown, clientId: string): Promise<PromptSubmitResult> {
    const response = await fetch(`${this.config.comfyBaseUrl}/prompt`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ client_id: clientId, prompt })
    });

    const json = (await response.json()) as { prompt_id?: string; number?: number; error?: string };

    if (!response.ok || !json.prompt_id) {
      throw new Error(json.error ?? `ComfyUI /prompt failed with ${response.status}`);
    }

    return { promptId: json.prompt_id, number: json.number };
  }

  async getHistory(promptId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.config.comfyBaseUrl}/history/${encodeURIComponent(promptId)}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new Error(`ComfyUI /history failed with ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  async pollHistory(promptId: string, intervalMs: number, maxAttempts: number): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const history = await this.getHistory(promptId);
      if (Object.keys(history).length > 0) return history;
      await sleep(intervalMs);
    }

    throw new Error(`Timed out waiting for history for prompt ${promptId}`);
  }

  async watchPrompt(promptId: string, clientId: string, handlers: WsEventHandlers, timeoutMs: number): Promise<'success' | 'error' | 'timeout'> {
    const wsBase = this.config.comfyBaseUrl.replace(/^http/i, 'ws');
    const url = `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: this.headers()
      });

      let settled = false;
      const finish = (result: 'success' | 'error' | 'timeout', error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish('timeout');
      }, timeoutMs);

      ws.once('error', (error) => {
        finish('timeout', error);
      });

      ws.on('message', async (raw) => {
        let event: { type?: string; data?: Record<string, unknown> };
        try {
          event = JSON.parse(raw.toString()) as { type?: string; data?: Record<string, unknown> };
        } catch {
          return;
        }

        const type = event.type;
        const data = event.data ?? {};
        if (typeof data.prompt_id === 'string' && data.prompt_id !== promptId) return;

        switch (type) {
          case 'execution_start':
            await handlers.onStart?.(data);
            break;
          case 'progress':
            await handlers.onProgress?.(data as { value?: number; max?: number } & Record<string, unknown>);
            break;
          case 'executing':
            await handlers.onExecuting?.(data);
            break;
          case 'executed':
            await handlers.onExecuted?.(data);
            break;
          case 'execution_success':
            await handlers.onSuccess?.(data);
            finish('success');
            break;
          case 'execution_error':
          case 'execution_interrupted':
            await handlers.onError?.(data);
            finish('error');
            break;
          default:
            break;
        }
      });

      ws.once('close', () => {
        if (!settled) finish('timeout');
      });
    });
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      ...(this.config.comfyApiKey ? { 'x-api-key': this.config.comfyApiKey } : {}),
      ...extra
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
