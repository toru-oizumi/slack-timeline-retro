import { createHmac } from 'node:crypto';
import type { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '@/shared/types';

// Mock modules
vi.mock('@/infrastructure/slack/SlackRepository');
vi.mock('@/infrastructure/ai/AIService');

describe('Slack Routes Integration', () => {
  let app: Hono<{ Bindings: Env }>;
  let mockEnv: Env;

  const SIGNING_SECRET = 'test-signing-secret';

  function createValidSignature(body: string, timestamp: string): string {
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = createHmac('sha256', SIGNING_SECRET);
    hmac.update(baseString);
    return `v0=${hmac.digest('hex')}`;
  }

  beforeEach(async () => {
    mockEnv = {
      SLACK_BOT_TOKEN: 'xoxb-test-token',
      SLACK_SIGNING_SECRET: SIGNING_SECRET,
      ANTHROPIC_API_KEY: 'test-api-key',
      ENVIRONMENT: 'development',
      TARGET_YEAR: '2025',
    };

    // Set process.env for Node.js compatibility
    process.env.SLACK_BOT_TOKEN = mockEnv.SLACK_BOT_TOKEN;
    process.env.SLACK_SIGNING_SECRET = mockEnv.SLACK_SIGNING_SECRET;
    process.env.ANTHROPIC_API_KEY = mockEnv.ANTHROPIC_API_KEY;
    process.env.ENVIRONMENT = mockEnv.ENVIRONMENT;
    process.env.TARGET_YEAR = mockEnv.TARGET_YEAR;

    // Re-import app to apply mocks
    const { default: importedApp } = await import('@/index');
    app = importedApp;
  });

  describe('GET /', () => {
    it('should return app info', async () => {
      const res = await app.request('/');

      expect(res.status).toBe(200);
      const json = (await res.json()) as { name: string };
      expect(json.name).toBe('Slack Timeline Retro');
    });
  });

  describe('GET /health', () => {
    it('should pass health check', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string; timestamp: string };
      expect(json.status).toBe('ok');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('POST /slack/command', () => {
    it('should return 401 for invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = 'token=test&user_id=U12345&command=/summarize-2025&text=weekly';

      const res = await app.request(
        '/slack/command',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Slack-Request-Timestamp': timestamp,
            'X-Slack-Signature': 'v0=invalid',
          },
          body,
        },
        {
          ...mockEnv,
        } as unknown as Env
      );

      expect(res.status).toBe(401);
    });

    it('should return 401 for stale timestamp', async () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
      const body = 'token=test&user_id=U12345&command=/summarize-2025&text=weekly';
      const signature = createValidSignature(body, oldTimestamp);

      const res = await app.request(
        '/slack/command',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Slack-Request-Timestamp': oldTimestamp,
            'X-Slack-Signature': signature,
          },
          body,
        },
        {
          ...mockEnv,
        } as unknown as Env
      );

      expect(res.status).toBe(401);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for non-existent path', async () => {
      const res = await app.request('/nonexistent');

      expect(res.status).toBe(404);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe('NOT_FOUND');
    });
  });
});
