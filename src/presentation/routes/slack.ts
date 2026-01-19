import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { DateService } from '@/infrastructure/date';
import { JobRepository, TokenRepository } from '@/infrastructure/firestore';
import { PubSubClient } from '@/infrastructure/pubsub';
import { SlackRepository } from '@/infrastructure/slack';
import { defaultWorkspaceConfig } from '@/shared/config';
import { AuthenticationError } from '@/shared/errors';
import type { Env, SlackCommandPayload } from '@/shared/types';

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
 * Calculate total tasks based on summary type
 */
function calculateTotalTasks(type: 'weekly' | 'monthly' | 'yearly', year: number): number {
  switch (type) {
    case 'weekly':
      return 1;
    case 'monthly':
      // One task per week in the month (typically 4-5)
      return 5; // Max weeks in a month
    case 'yearly': {
      // One task per week in the year (52 or 53)
      const dateService = new DateService();
      return dateService.getAllWeeksInYear(year).length;
    }
    default:
      return 1;
  }
}

/**
 * Parse command to get summary type and options
 * Defaults to 'yearly' if no type specified
 */
function parseCommand(text: string): {
  type: 'weekly' | 'monthly' | 'yearly';
  includePrivate: boolean;
  includeDM: boolean;
  includeGroup: boolean;
} {
  const parts = text.trim().split(/\s+/);
  const lowerParts = parts.map((p) => p.toLowerCase());
  const includePrivate = lowerParts.includes('--private');
  const includeDM = lowerParts.includes('--dm');
  const includeGroup = lowerParts.includes('--group');
  const nonFlagParts = lowerParts.filter((p) => !p.startsWith('--'));
  const firstArg = nonFlagParts[0];

  // Default to yearly if no type specified or empty
  const type =
    firstArg && ['weekly', 'monthly', 'yearly'].includes(firstArg)
      ? (firstArg as 'weekly' | 'monthly' | 'yearly')
      : 'yearly';

  return { type, includePrivate, includeDM, includeGroup };
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

  // Parse command to get type (defaults to yearly if not specified)
  const { type, includePrivate, includeDM, includeGroup } = parseCommand(payload.text);

  const botToken = env.SLACK_BOT_TOKEN;
  const userId = payload.user_id;

  // Check for user token (OAuth authorization)
  const tokenRepository = new TokenRepository();
  const userTokenData = await tokenRepository.getToken(userId);

  if (!userTokenData) {
    // User needs to authorize - return OAuth link
    const url = new URL(c.req.url);
    // Use X-Forwarded-Proto for Cloud Run, fallback to https
    const protocol = c.req.header('X-Forwarded-Proto') ?? 'https';
    const oauthUrl = `${protocol}://${url.host}/oauth/install?user_id=${userId}`;

    return c.json({
      response_type: 'ephemeral',
      text: `🔐 *Authorization Required*\n\nTo read your messages, please authorize the app first:\n<${oauthUrl}|Click here to authorize>\n\n_After authorization, run the command again._`,
    });
  }

  const userToken = userTokenData.accessToken;
  console.log(
    `User token found for: ${userId}, expires at: ${userTokenData.expiresAt.toISOString()}`
  );

  // Create SlackRepository with user token (for self-DM posting)
  const slackRepository = new SlackRepository(botToken, defaultWorkspaceConfig, 'en_US', userToken);

  // Open self-DM channel (user's own DM with themselves)
  const selfDmChannelId = await slackRepository.openSelfDMChannel(userId);
  console.log(`Opened self-DM channel: ${selfDmChannelId} for user: ${userId}`);

  // Post start message to create thread (using user token)
  const optionNotes: string[] = [];
  if (includePrivate) optionNotes.push('📁 private channels');
  if (includeDM) optionNotes.push('💬 DMs');
  if (includeGroup) optionNotes.push('👥 group DMs');
  const optionsText = optionNotes.length > 0 ? `\n_Including: ${optionNotes.join(', ')}_` : '';
  const startMessage = `🔄 *Generating ${type} summary...*\n_Please wait while I analyze your posts._${optionsText}`;

  const threadTs = await slackRepository.postToSelfDM({
    channelId: selfDmChannelId,
    text: startMessage,
  });
  console.log(`Thread created: channel=${selfDmChannelId}, thread_ts=${threadTs}`);

  // Refresh token expiration on use
  await tokenRepository.refreshToken(userId);

  // Get target year from environment or default to current year
  const targetYear = Number(env.TARGET_YEAR) || new Date().getFullYear();

  // Calculate total tasks for this job type
  const totalTasks = calculateTotalTasks(type, targetYear);

  // Create job in Firestore
  const jobRepository = new JobRepository();
  const job = await jobRepository.createJob({
    type,
    year: targetYear,
    userId,
    channelId: selfDmChannelId,
    threadTs,
    userToken,
    totalTasks,
    options: { includePrivate, includeDM, includeGroup },
  });

  console.log(`Job created: ${job.id}, type: ${type}, totalTasks: ${totalTasks}`);

  // Publish to Pub/Sub to trigger processing
  const pubsubClient = new PubSubClient();
  await pubsubClient.publishSummaryJob({ jobId: job.id });

  console.log(`Job ${job.id} published to Pub/Sub`);

  // Return immediate acknowledgment
  const ackOptions: string[] = [];
  if (includePrivate) ackOptions.push('private');
  if (includeDM) ackOptions.push('DMs');
  if (includeGroup) ackOptions.push('group DMs');
  const ackOptionsText = ackOptions.length > 0 ? ` (including ${ackOptions.join(', ')})` : '';
  return c.json({
    response_type: 'ephemeral',
    text: `🚀 Starting ${type} summary generation${ackOptionsText}... Check your self-DM (notes to self)!`,
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
