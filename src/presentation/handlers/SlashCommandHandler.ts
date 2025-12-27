import { SlackChannel } from '@/domain';
import { AIService } from '@/infrastructure/ai';
import { DateService } from '@/infrastructure/date';
import { SlackRepository } from '@/infrastructure/slack';
import { loadWorkspaceConfig } from '@/shared/config';
import type { CommandResult, Env, SlackCommandPayload } from '@/shared/types';
import { GenerateMonthlySummary, GenerateWeeklySummary, GenerateYearlySummary } from '@/usecases';

/**
 * Slack slash command handler
 */
export class SlashCommandHandler {
  private readonly slackRepository: SlackRepository;
  private readonly aiService: AIService;
  private readonly dateService: DateService;
  private readonly channel: SlackChannel;
  private readonly targetYear: number;

  constructor(env: Env) {
    const workspaceConfig = loadWorkspaceConfig(
      env as unknown as Record<string, string | undefined>
    );
    this.slackRepository = new SlackRepository(env.SLACK_BOT_TOKEN, workspaceConfig);
    this.aiService = AIService.createWithLegacyParams({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AI_MODEL,
      maxTokens: env.AI_MAX_TOKENS ? Number.parseInt(env.AI_MAX_TOKENS, 10) : undefined,
    });
    this.dateService = new DateService();
    this.channel = SlackChannel.createDM(env.DM_CHANNEL_ID, env.THREAD_TS);
    this.targetYear = Number.parseInt(env.TARGET_YEAR ?? new Date().getFullYear().toString(), 10);
  }

  /**
   * Parse and execute command
   */
  async handle(payload: SlackCommandPayload): Promise<CommandResult> {
    const args = this.parseCommand(payload.text);

    switch (args.type) {
      case 'weekly':
        return this.handleWeekly(payload.user_id, args.date ?? new Date());
      case 'monthly':
        return this.handleMonthly(args.month ?? new Date().getMonth() + 1);
      case 'yearly':
        return this.handleYearly();
      default:
        return {
          success: false,
          message: 'Usage: /summarize-2025 [weekly|monthly|yearly] [options]',
        };
    }
  }

  private parseCommand(text: string): ParsedCommand {
    const parts = text.trim().toLowerCase().split(/\s+/);
    const type = parts[0] as 'weekly' | 'monthly' | 'yearly' | undefined;

    switch (type) {
      case 'weekly': {
        // /summarize-2025 weekly [YYYY-MM-DD]
        const dateStr = parts[1];
        const date = dateStr ? new Date(dateStr) : new Date();
        return { type: 'weekly', date };
      }
      case 'monthly': {
        // /summarize-2025 monthly [1-12]
        const monthStr = parts[1];
        const month = monthStr ? Number.parseInt(monthStr, 10) : new Date().getMonth() + 1;
        return { type: 'monthly', month };
      }
      case 'yearly':
        return { type: 'yearly' };
      default:
        // Default to weekly summary for current week
        return { type: 'weekly', date: new Date() };
    }
  }

  private async handleWeekly(userId: string, targetDate: Date): Promise<CommandResult> {
    const usecase = new GenerateWeeklySummary(this.slackRepository, this.aiService);

    const result = await usecase.execute({
      userId,
      targetDate,
      year: this.targetYear,
      channel: this.channel,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate weekly summary: ${result.error.message}`,
      };
    }

    return {
      success: true,
      message: `Weekly summary created (${result.value.dateRange.format()})`,
      summaryId: result.value.id ?? undefined,
    };
  }

  private async handleMonthly(month: number): Promise<CommandResult> {
    if (month < 1 || month > 12) {
      return {
        success: false,
        message: 'Month must be between 1 and 12',
      };
    }

    const usecase = new GenerateMonthlySummary(this.slackRepository, this.aiService);

    const result = await usecase.execute({
      year: this.targetYear,
      month,
      channel: this.channel,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate monthly summary: ${result.error.message}`,
      };
    }

    return {
      success: true,
      message: `Monthly summary for ${month} created`,
      summaryId: result.value.id ?? undefined,
    };
  }

  private async handleYearly(): Promise<CommandResult> {
    const usecase = new GenerateYearlySummary(this.slackRepository, this.aiService);

    const result = await usecase.execute({
      year: this.targetYear,
      channel: this.channel,
    });

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to generate yearly summary: ${result.error.message}`,
      };
    }

    return {
      success: true,
      message: `Yearly summary for ${this.targetYear} created (also posted to channel)`,
      summaryId: result.value.id ?? undefined,
    };
  }
}

interface ParsedCommand {
  type: 'weekly' | 'monthly' | 'yearly';
  date?: Date;
  month?: number;
}
