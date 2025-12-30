import { SlackChannel } from '@/domain';
import { AIService } from '@/infrastructure/ai';
import { defaultAIConfig, type Locale } from '@/infrastructure/config';
import { SlackRepository } from '@/infrastructure/slack';
import { loadConfig, loadWorkspaceConfig, type WorkspaceConfig } from '@/shared/config';
import type { CommandResult, Env, SlackCommandPayload } from '@/shared/types';
import { GenerateMonthlySummary, GenerateWeeklySummary, GenerateYearlySummary } from '@/usecases';

/**
 * Slack slash command handler
 */
export class SlashCommandHandler {
  private readonly env: Env;
  private readonly userToken: string;
  private readonly aiService: AIService;
  private readonly targetYear: number;
  private readonly locale: Locale;
  private readonly baseWorkspaceConfig: WorkspaceConfig;

  constructor(env: Env, userToken: string) {
    this.env = env;
    this.userToken = userToken;
    const envRecord = env as unknown as Record<string, string | undefined>;
    const config = loadConfig(envRecord);
    this.baseWorkspaceConfig = loadWorkspaceConfig(envRecord);
    this.locale = config.app.locale as Locale;

    this.aiService = new AIService({
      apiKey: config.ai.apiKey,
      config: {
        model: {
          provider: config.ai.provider,
          id: config.ai.model,
        },
        generation: {
          ...defaultAIConfig.generation,
          maxTokens: config.ai.maxTokens,
        },
      },
      locale: this.locale,
    });
    this.targetYear = config.app.targetYear;
  }

  /**
   * Create SlackRepository with command-specific options
   * Uses user token for reading messages and posting to self-DM
   */
  private createSlackRepository(options: CommandOptions): SlackRepository {
    const workspaceConfig: WorkspaceConfig = {
      ...this.baseWorkspaceConfig,
      includePrivateChannels:
        options.includePrivateChannels ?? this.baseWorkspaceConfig.includePrivateChannels,
    };
    return new SlackRepository(
      this.env.SLACK_BOT_TOKEN,
      workspaceConfig,
      this.locale,
      this.userToken
    );
  }

  /**
   * Parse and execute command
   */
  async handle(payload: SlackCommandPayload): Promise<CommandResult> {
    // Note: channel_id is the self-DM channel opened by the route handler
    const channel = SlackChannel.create(payload.channel_id, payload.threadTs);
    const args = this.parseCommand(payload.text);
    const options: CommandOptions = {
      includePrivateChannels: args.includePrivate,
    };

    switch (args.type) {
      case 'weekly':
        return this.handleWeekly(payload.user_id, args.date ?? new Date(), channel, options);
      case 'monthly':
        return this.handleMonthly(
          payload.user_id,
          args.month ?? new Date().getMonth() + 1,
          channel,
          options
        );
      default:
        return this.handleYearly(payload.user_id, channel, options);
    }
  }

  private parseCommand(text: string): ParsedCommand {
    const parts = text.trim().split(/\s+/);
    const lowerParts = parts.map((p) => p.toLowerCase());

    // Check for --private flag
    const includePrivate = lowerParts.includes('--private');

    // Filter out flags for type parsing
    const nonFlagParts = lowerParts.filter((p) => !p.startsWith('--'));
    const type = nonFlagParts[0] as 'weekly' | 'monthly' | 'yearly' | undefined;

    switch (type) {
      case 'weekly': {
        // /summarize-2025 weekly [YYYY-MM-DD] [--private]
        const dateStr = nonFlagParts[1];
        const date = dateStr && !Number.isNaN(Date.parse(dateStr)) ? new Date(dateStr) : new Date();
        return { type: 'weekly', date, includePrivate };
      }
      case 'monthly': {
        // /summarize-2025 monthly [1-12] [--private]
        const monthStr = nonFlagParts[1];
        const month = monthStr ? Number.parseInt(monthStr, 10) : new Date().getMonth() + 1;
        return { type: 'monthly', month, includePrivate };
      }
      default:
        // Default to yearly summary
        return { type: 'yearly', includePrivate };
    }
  }

  private async handleWeekly(
    userId: string,
    targetDate: Date,
    channel: SlackChannel,
    options: CommandOptions
  ): Promise<CommandResult> {
    const slackRepository = this.createSlackRepository(options);
    const usecase = new GenerateWeeklySummary(slackRepository, this.aiService);

    const result = await usecase.execute({
      userId,
      targetDate,
      year: this.targetYear,
      channel,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate weekly summary: ${result.error.message}`,
      };
    }

    const privateNote = options.includePrivateChannels ? ' (including private channels)' : '';
    return {
      success: true,
      message: `Weekly summary created (${result.value.dateRange.format()})${privateNote}`,
      summaryId: result.value.id ?? undefined,
    };
  }

  private async handleMonthly(
    userId: string,
    month: number,
    channel: SlackChannel,
    options: CommandOptions
  ): Promise<CommandResult> {
    if (month < 1 || month > 12) {
      return {
        success: false,
        message: 'Month must be between 1 and 12',
      };
    }

    const slackRepository = this.createSlackRepository(options);
    const usecase = new GenerateMonthlySummary(slackRepository, this.aiService);

    const result = await usecase.execute({
      year: this.targetYear,
      month,
      channel,
      userId,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate monthly summary: ${result.error.message}`,
      };
    }

    const privateNote = options.includePrivateChannels ? ' (including private channels)' : '';
    return {
      success: true,
      message: `Monthly summary for ${month} created${privateNote}`,
      summaryId: result.value.id ?? undefined,
    };
  }

  private async handleYearly(
    userId: string,
    channel: SlackChannel,
    options: CommandOptions
  ): Promise<CommandResult> {
    const slackRepository = this.createSlackRepository(options);
    const usecase = new GenerateYearlySummary(slackRepository, this.aiService);

    const result = await usecase.execute({
      year: this.targetYear,
      channel,
      userId,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate yearly summary: ${result.error.message}`,
      };
    }

    const privateNote = options.includePrivateChannels ? ' (including private channels)' : '';
    return {
      success: true,
      message: `Yearly summary for ${this.targetYear} created${privateNote}`,
      summaryId: result.value.id ?? undefined,
    };
  }
}

interface CommandOptions {
  includePrivateChannels?: boolean;
}

interface ParsedCommand {
  type: 'weekly' | 'monthly' | 'yearly';
  date?: Date;
  month?: number;
  includePrivate?: boolean;
}
