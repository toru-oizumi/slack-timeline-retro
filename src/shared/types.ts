/**
 * Common type definitions
 */

/**
 * Cloudflare Workers environment variables
 */
export interface Env {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  // AI API keys (one of these is required)
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ENVIRONMENT?: string;
  TARGET_YEAR?: string;
  AI_MODEL?: string;
  AI_MAX_TOKENS?: string;
  // Locale setting (en_US or ja_JP)
  LOCALE?: string;
  // Workspace configuration
  INCLUDE_CHANNELS?: string;
  EXCLUDE_CHANNELS?: string;
  INCLUDE_PRIVATE_CHANNELS?: string;
  INCLUDE_DIRECT_MESSAGES?: string;
  INCLUDE_GROUP_MESSAGES?: string;
}

/**
 * Slack command payload
 */
export interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  /** Thread timestamp for posting replies (set by route handler) */
  threadTs?: string;
}

/**
 * Summary command arguments
 */
export interface SummaryCommandArgs {
  type: 'weekly' | 'monthly' | 'yearly';
  year: number;
  month?: number;
  weekNumber?: number;
  date?: Date;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message: string;
  summaryId?: string;
}
