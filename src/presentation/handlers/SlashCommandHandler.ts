import { SlackChannel } from '@/domain';
import { AIService } from '@/infrastructure/ai';
import { defaultAIConfig, type Locale } from '@/infrastructure/config';
import { DateService } from '@/infrastructure/date';
import { SlackRepository } from '@/infrastructure/slack';
import { loadConfig, loadWorkspaceConfig, type WorkspaceConfig } from '@/shared/config';
import type { CommandResult, Env, SlackCommandPayload } from '@/shared/types';
import { GenerateMonthlySummary, GenerateWeeklySummary, GenerateYearlySummary } from '@/usecases';

/**
 * Slack slash command handler
 */
export class SlashCommandHandler {
  private readonly env: Env;
  private readonly aiService: AIService;
  private readonly targetYear: number;
  private readonly locale: Locale;
  private readonly baseWorkspaceConfig: WorkspaceConfig;

  constructor(env: Env) {
    this.env = env;
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
    this.dateService = new DateService();
    this.targetYear = config.app.targetYear;
  }

  /**
   * Create SlackRepository with command-specific options
   */
  private createSlackRepository(options: CommandOptions): SlackRepository {
    const workspaceConfig: WorkspaceConfig = {
      ...this.baseWorkspaceConfig,
      includePrivateChannels:
        options.includePrivateChannels ?? this.baseWorkspaceConfig.includePrivateChannels,
    };
    return new SlackRepository(this.env.SLACK_BOT_TOKEN, workspaceConfig, this.locale);
  }

  /**
   * Parse and execute command
   */
  async handle(payload: SlackCommandPayload): Promise<CommandResult> {
    // Only allow execution in DM channels (channel IDs starting with 'D')
    if (!payload.channel_id.startsWith('D')) {
      return {
        success: false,
        message: 'This command can only be used in direct messages (DM).',
      };
    }

    const channel = SlackChannel.create(payload.channel_id);
    const args = this.parseCommand(payload.text);
    const options: CommandOptions = {
      includePrivateChannels: args.includePrivate,
    };

    switch (args.type) {
      case 'weekly':
        return this.handleWeekly(payload.user_id, args.date ?? new Date(), channel, options);
      case 'monthly':
        return this.handleMonthly(args.month ?? new Date().getMonth() + 1, channel, options);
      case 'yearly':
        return this.handleYearly(channel, options);
      default:
        return {
          success: false,
          message: 'Usage: /summarize-2025 [weekly|monthly|yearly] [--private] [options]',
        };
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
      case 'yearly':
        return { type: 'yearly', includePrivate };
      default:
        // Default to weekly summary for current week
        return { type: 'weekly', date: new Date(), includePrivate };
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
    channel: SlackChannel,
    options: CommandOptions
  ): Promise<CommandResult> {
    const slackRepository = this.createSlackRepository(options);
    const usecase = new GenerateYearlySummary(slackRepository, this.aiService);

    const result = await usecase.execute({
      year: this.targetYear,
      channel,
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
