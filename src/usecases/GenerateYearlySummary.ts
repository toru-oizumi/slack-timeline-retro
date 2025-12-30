import type { IAIService, ISlackRepository } from '@/domain';
import { DateRange, type SlackChannel, Summary, SummaryType } from '@/domain';
import { err, ok, type Result, SummaryNotFoundError } from '@/shared/errors';

/**
 * Yearly summary generation use case
 */
export class GenerateYearlySummary {
  constructor(
    private readonly slackRepository: ISlackRepository,
    private readonly aiService: IAIService
  ) {}

  /**
   * Generate and post a yearly summary (also broadcasts to channel)
   */
  async execute(params: GenerateYearlySummaryParams): Promise<Result<Summary, Error>> {
    try {
      // 1. Calculate year date range
      const dateRange = DateRange.forYear(params.year);

      // 2. Fetch monthly summaries from thread
      const monthlySummaries = await this.slackRepository.fetchSummariesFromThread({
        channel: params.channel,
        type: SummaryType.MONTHLY,
        year: params.year,
      });

      // Sort monthly summaries by month
      const sortedSummaries = monthlySummaries.sort((a, b) => {
        return (a.month ?? 0) - (b.month ?? 0);
      });

      if (sortedSummaries.length === 0) {
        return err(new SummaryNotFoundError('monthly', `${params.year}`));
      }

      // 3. Generate yearly summary with AI
      const generated = await this.aiService.generateYearlySummary(sortedSummaries);

      // 4. Create Summary entity
      const summary = Summary.createYearly({
        content: generated.content,
        dateRange,
        year: params.year,
      });

      // 5. Broadcast to Slack (thread reply + channel display)
      const summaryId = await this.slackRepository.broadcastSummary({
        channel: params.channel,
        summary,
      });

      // 6. Return Summary with ID
      const postedSummary = Summary.createYearly({
        id: summaryId,
        content: generated.content,
        dateRange,
        year: params.year,
      });

      return ok(postedSummary);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GenerateYearlySummaryParams {
  year: number;
  channel: SlackChannel;
}
