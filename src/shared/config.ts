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
}

export interface AIConfig {
  apiKey: string;
  provider: 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
}

export interface ApplicationConfig {
  environment: 'development' | 'production';
  targetYear: number;
  locale: 'en_US' | 'ja_JP';
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
  includePrivateChannels: false,
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
  };

  // Detect AI provider and get API key
  const { apiKey, provider } = getAICredentials(env);

  const ai: AIConfig = {
    apiKey,
    provider,
    model:
      env.AI_MODEL ??
      (provider === 'openai' ? 'gpt-5-mini-2025-08-07' : 'claude-sonnet-4-5-20250929'),
    maxTokens: Number.parseInt(env.AI_MAX_TOKENS ?? '4096', 10),
  };

  const locale = (env.LOCALE === 'ja_JP' ? 'ja_JP' : 'en_US') as 'en_US' | 'ja_JP';

  const app: ApplicationConfig = {
    environment: (env.ENVIRONMENT ?? 'development') as 'development' | 'production',
    targetYear: Number.parseInt(env.TARGET_YEAR ?? new Date().getFullYear().toString(), 10),
    locale,
  };

  return { slack, ai, app };
}

/**
 * Get AI credentials from environment (supports OpenAI and Anthropic)
 */
function getAICredentials(env: Record<string, string | undefined>): {
  apiKey: string;
  provider: 'openai' | 'anthropic';
} {
  // Prefer OpenAI if available
  if (env.OPENAI_API_KEY) {
    return { apiKey: env.OPENAI_API_KEY, provider: 'openai' };
  }
  // Fall back to Anthropic
  if (env.ANTHROPIC_API_KEY) {
    return { apiKey: env.ANTHROPIC_API_KEY, provider: 'anthropic' };
  }
  throw new Error('Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be set');
}

/**
 * Load workspace configuration from environment variables
 */
export function loadWorkspaceConfig(env: Record<string, string | undefined>): WorkspaceConfig {
  return {
    includeChannels: parseChannelList(env.INCLUDE_CHANNELS),
    excludeChannels: parseChannelList(env.EXCLUDE_CHANNELS),
    includePrivateChannels: env.INCLUDE_PRIVATE_CHANNELS === 'true',
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
