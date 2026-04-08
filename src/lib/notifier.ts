import type { AppConfig } from '../config.js';

export interface NotificationPayload extends Record<string, unknown> {
  taskId: string;
  sessionId: string;
  channel: string;
  replyTo: string;
  status: string;
}

export class ImNotifier {
  constructor(private readonly config: AppConfig) {}

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.config.imWebhookUrl) {
      console.info('[im-notifier] IM_WEBHOOK_URL is not set; payload only logged', payload);
      return;
    }

    const response = await fetch(this.config.imWebhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.imWebhookToken ? { authorization: `Bearer ${this.config.imWebhookToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`IM webhook failed with ${response.status}`);
    }
  }
}
