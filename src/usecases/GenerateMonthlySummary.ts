import type { IAIService, ISlackRepository } from '@/domain';
import { DateRange, type SlackChannel, Summary, SummaryType } from '@/domain';
import { err, ok, type Result, SummaryNotFoundError } from '@/shared/errors';

/**
 * Monthly summary generation use case
 */
export class GenerateMonthlySummary {
  constructor(
    private readonly slackRepository: ISlackRepository,
    private readonly aiService: IAIService
  ) {}

  /**
   * Generate and post a monthly summary
   *
   * Target: All weekly summaries that overlap with at least one day of the month
   */
  async execute(params: GenerateMonthlySummaryParams): Promise<Result<Summary, Error>> {
    try {
      // 1. Calculate month date range
      const targetDate = new Date(params.year, params.month - 1, 1);
      const dateRange = DateRange.forMonth(targetDate);

      // 2. Fetch weekly summaries from thread
      const allWeeklySummaries = await this.slackRepository.fetchSummariesFromThread({
        channel: params.channel,
        type: SummaryType.WEEKLY,
        year: params.year,
      });

      // 3. Filter weekly summaries that overlap with the target month
      const relevantSummaries = allWeeklySummaries.filter((summary) =>
        summary.overlapsWithMonth(params.year, params.month)
      );

      if (relevantSummaries.length === 0) {
        return err(new SummaryNotFoundError('weekly', `${params.year}/${params.month}`));
      }

      // 4. Generate monthly summary with AI
      const generated = await this.aiService.generateMonthlySummary(relevantSummaries);

      // 5. Create Summary entity
      const summary = Summary.createMonthly({
        content: generated.content,
        dateRange,
        year: params.year,
        month: params.month,
      });

      // 6. Post to Slack
      const summaryId = await this.slackRepository.postSummaryToThread({
        channel: params.channel,
        summary,
      });

      // 7. Return Summary with ID
      const postedSummary = Summary.createMonthly({
        id: summaryId,
        content: generated.content,
        dateRange,
        year: params.year,
        month: params.month,
      });

      return ok(postedSummary);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GenerateMonthlySummaryParams {
  year: number;
  month: number; // 1-12
  channel: SlackChannel;
}
