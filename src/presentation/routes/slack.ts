import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthenticationError } from '@/shared/errors';
import type { Env, SlackCommandPayload } from '@/shared/types';
import { Hono } from 'hono';
import { SlashCommandHandler } from '../handlers/SlashCommandHandler';

const slackRoutes = new Hono<{ Bindings: Env }>();

/**
 * Verify Slack request signature
 */
async function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): Promise<boolean> {
  // Timestamp check (within 5 minutes)
  const requestTimestamp = Number.parseInt(timestamp, 10);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTimestamp - requestTimestamp) > 60 * 5) {
    return false;
  }

  // Signature verification
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Parse URL-encoded body
 */
function parseFormData(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

/**
 * Slack slash command endpoint
 */
slackRoutes.post('/slack/command', async (c) => {
  const env = c.env;

  // Get request body
  const body = await c.req.text();

  // Verify signature
  const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? '';
  const signature = c.req.header('X-Slack-Signature') ?? '';

  const isValid = await verifySlackRequest(body, timestamp, signature, env.SLACK_SIGNING_SECRET);

  if (!isValid) {
    throw new AuthenticationError('Slack signature verification failed');
  }

  // Parse payload
  const formData = parseFormData(body);
  const payload: SlackCommandPayload = {
    token: formData.token ?? '',
    team_id: formData.team_id ?? '',
    team_domain: formData.team_domain ?? '',
    channel_id: formData.channel_id ?? '',
    channel_name: formData.channel_name ?? '',
    user_id: formData.user_id ?? '',
    user_name: formData.user_name ?? '',
    command: formData.command ?? '',
    text: formData.text ?? '',
    response_url: formData.response_url ?? '',
    trigger_id: formData.trigger_id ?? '',
  };

  // Return response within 3 seconds
  // Actual processing runs in background
  c.executionCtx.waitUntil(
    (async () => {
      const handler = new SlashCommandHandler(env);
      const result = await handler.handle(payload);

      // Send result to response_url
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: result.message,
        }),
      });
    })()
  );

  // Return immediate processing message
  return c.json({
    response_type: 'ephemeral',
    text: '🔄 Generating summary. Please wait...',
  });
});

/**
 * Health check endpoint
 */
slackRoutes.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export { slackRoutes };
