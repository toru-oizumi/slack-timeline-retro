/**
 * Application configuration
 */
export interface AppConfig {
  slack: SlackConfig;
  ai: AIConfig;
  app: ApplicationConfig;
}

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  dmChannelId: string;
  threadTs: string;
}

export interface AIConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface ApplicationConfig {
  environment: 'development' | 'production';
  targetYear: number;
}

/**
 * Workspace configuration for channel filtering
 */
export interface WorkspaceConfig {
  /**
   * Channels to include for message fetching (if empty, all joined channels are used)
   */
  includeChannels: string[];

  /**
   * Channels to exclude from message fetching
   */
  excludeChannels: string[];

  /**
   * Include private channels
   */
  includePrivateChannels: boolean;

  /**
   * Include direct messages
   */
  includeDirectMessages: boolean;

  /**
   * Include group direct messages
   */
  includeGroupMessages: boolean;
}

/**
 * Default workspace configuration
 */
export const defaultWorkspaceConfig: WorkspaceConfig = {
  includeChannels: [],
  excludeChannels: [],
  includePrivateChannels: true,
  includeDirectMessages: false,
  includeGroupMessages: false,
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const slack: SlackConfig = {
    botToken: requireEnv(env, 'SLACK_BOT_TOKEN'),
    signingSecret: requireEnv(env, 'SLACK_SIGNING_SECRET'),
    dmChannelId: requireEnv(env, 'DM_CHANNEL_ID'),
    threadTs: requireEnv(env, 'THREAD_TS'),
  };

  const ai: AIConfig = {
    apiKey: requireEnv(env, 'ANTHROPIC_API_KEY'),
    model: env.AI_MODEL ?? 'claude-3-5-sonnet-20241022',
    maxTokens: Number.parseInt(env.AI_MAX_TOKENS ?? '4096', 10),
  };

  const app: ApplicationConfig = {
    environment: (env.ENVIRONMENT ?? 'development') as 'development' | 'production',
    targetYear: Number.parseInt(env.TARGET_YEAR ?? new Date().getFullYear().toString(), 10),
  };

  return { slack, ai, app };
}

/**
 * Load workspace configuration from environment variables
 */
export function loadWorkspaceConfig(env: Record<string, string | undefined>): WorkspaceConfig {
  return {
    includeChannels: parseChannelList(env.INCLUDE_CHANNELS),
    excludeChannels: parseChannelList(env.EXCLUDE_CHANNELS),
    includePrivateChannels: env.INCLUDE_PRIVATE_CHANNELS !== 'false',
    includeDirectMessages: env.INCLUDE_DIRECT_MESSAGES === 'true',
    includeGroupMessages: env.INCLUDE_GROUP_MESSAGES === 'true',
  };
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

function parseChannelList(value: string | undefined): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((ch) => ch.trim())
    .filter(Boolean);
}
