import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { SlackRepository } from '@/infrastructure/slack';
import { defaultWorkspaceConfig } from '@/shared/config';
import { AuthenticationError } from '@/shared/errors';
import type { Env, SlackCommandPayload } from '@/shared/types';
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
 * Run async task in background (Node.js compatible)
 */
function runInBackground(fn: () => Promise<void>): void {
  // Use setImmediate for Node.js to schedule the task
  setImmediate(() => {
    fn().catch((error) => {
      console.error('Background task error:', error);
    });
  });
}

/**
 * Parse command to get summary type and options
 */
function parseCommand(text: string): {
  type: 'weekly' | 'monthly' | 'yearly' | undefined;
  includePrivate: boolean;
} {
  const parts = text.trim().split(/\s+/);
  const lowerParts = parts.map((p) => p.toLowerCase());
  const includePrivate = lowerParts.includes('--private');
  const nonFlagParts = lowerParts.filter((p) => !p.startsWith('--'));
  const type = nonFlagParts[0] as 'weekly' | 'monthly' | 'yearly' | undefined;

  return { type, includePrivate };
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

  // Parse command to get type
  const { type, includePrivate } = parseCommand(payload.text);
  if (!type || !['weekly', 'monthly', 'yearly'].includes(type)) {
    return c.json({
      response_type: 'ephemeral',
      text: '❌ Usage: /summarize-2025 [weekly|monthly|yearly] [--private] [options]',
    });
  }

  // Return response immediately to avoid Slack timeout (3 seconds)
  // All Slack API calls happen in the background
  const botToken = env.SLACK_BOT_TOKEN;
  const userId = payload.user_id;

  runInBackground(async () => {
    try {
      // Create SlackRepository for posting messages
      const slackRepository = new SlackRepository(botToken, defaultWorkspaceConfig, 'en_US');

      // Open DM channel with the user (this ensures the bot can post messages)
      const dmChannelId = await slackRepository.openDMChannel(userId);
      console.log(`Opened DM channel: ${dmChannelId} for user: ${userId}`);

      // Post start message to create thread
      const startMessage = `🔄 *Generating ${type} summary...*\n_Please wait while I analyze your posts._${includePrivate ? '\n📁 Including private channels.' : ''}`;

      const threadTs = await slackRepository.postStartMessage({
        channelId: dmChannelId,
        text: startMessage,
      });

      console.log(`Thread created: channel=${dmChannelId}, thread_ts=${threadTs}`);

      // Run the actual summary generation
      try {
        const handler = new SlashCommandHandler(env);
        const result = await handler.handle({
          ...payload,
          channel_id: dmChannelId,
          threadTs,
        });

        // Post completion message
        await slackRepository.postStartMessage({
          channelId: dmChannelId,
          text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('SlashCommand error:', errorMessage);

        await slackRepository.postStartMessage({
          channelId: dmChannelId,
          text: `❌ Error: ${errorMessage}`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Background task error:', errorMessage);
      // Can't post to Slack if we failed to open DM channel
    }
  });

  // Return immediate acknowledgment
  return c.json({
    response_type: 'ephemeral',
    text: `🚀 Starting ${type} summary generation... Check your DMs with the bot!`,
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
