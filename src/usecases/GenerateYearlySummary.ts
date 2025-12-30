import { addWeeks, getWeek, startOfWeek } from 'date-fns';
import type { IAIService, ISlackRepository } from '@/domain';
import { DateRange, type SlackChannel, Summary, SummaryType } from '@/domain';
import { err, ok, PostsNotFoundError, type Result, SummaryNotFoundError } from '@/shared/errors';

/**
 * Yearly summary generation use case
 *
 * New flow:
 * 1. Generate weekly summaries for all weeks in the year
 * 2. Generate monthly summaries for all months from weekly summaries
 * 3. Generate yearly summary from monthly summaries
 */
export class GenerateYearlySummary {
  constructor(
    private readonly slackRepository: ISlackRepository,
    private readonly aiService: IAIService
  ) {}

  /**
   * Generate and post a yearly summary (also broadcasts to channel)
   *
   * First generates all weekly and monthly summaries,
   * then aggregates them into a yearly summary.
   */
  async execute(params: GenerateYearlySummaryParams): Promise<Result<Summary, Error>> {
    try {
      const { year, channel, userId } = params;
      const yearRange = DateRange.forYear(year);

      // 1. Generate all weekly summaries for the year
      console.log(`Generating weekly summaries for ${year}...`);
      const weeksWithPosts = await this.generateAllWeeklySummaries(year, userId, channel);

      if (weeksWithPosts === 0) {
        return err(new PostsNotFoundError(`${year}`));
      }

      // 2. Generate monthly summaries for months that have weekly summaries
      console.log(`Generating monthly summaries for ${year}...`);
      await this.generateAllMonthlySummaries(year, channel);

      // 3. Fetch monthly summaries from thread
      const monthlySummaries = await this.slackRepository.fetchSummariesFromThread({
        channel,
        type: SummaryType.MONTHLY,
        year,
      });

      const sortedSummaries = monthlySummaries.sort((a, b) => (a.month ?? 0) - (b.month ?? 0));

      if (sortedSummaries.length === 0) {
        return err(new SummaryNotFoundError('monthly', `${year}`));
      }

      // 4. Generate yearly summary with AI
      const generated = await this.aiService.generateYearlySummary(sortedSummaries);

      // 5. Create Summary entity
      const summary = Summary.createYearly({
        content: generated.content,
        dateRange: yearRange,
        year,
      });

      // 6. Broadcast to Slack (thread reply + channel display)
      const summaryId = await this.slackRepository.broadcastSummary({
        channel,
        summary,
      });

      // 7. Return Summary with ID
      const postedSummary = Summary.createYearly({
        id: summaryId,
        content: generated.content,
        dateRange: yearRange,
        year,
      });

      return ok(postedSummary);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate weekly summaries for all weeks in the year
   * Returns the number of weeks that had posts
   */
  private async generateAllWeeklySummaries(
    year: number,
    userId: string,
    channel: SlackChannel
  ): Promise<number> {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    let currentWeekStart = startOfWeek(yearStart, { weekStartsOn: 1 });
    let weeksWithPosts = 0;

    while (currentWeekStart <= yearEnd) {
      const weekRange = DateRange.forWeek(currentWeekStart);

      // Skip weeks entirely outside the target year
      if (weekRange.end < yearStart) {
        currentWeekStart = addWeeks(currentWeekStart, 1);
        continue;
      }

      const posts = await this.slackRepository.fetchUserPosts({
        userId,
        dateRange: weekRange,
      });

      if (posts.length > 0) {
        const generated = await this.aiService.generateWeeklySummary(posts);
        const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });

        const weeklySummary = Summary.createWeekly({
          content: generated.content,
          dateRange: weekRange,
          year,
          weekNumber,
        });

        await this.slackRepository.postSummaryToThread({
          channel,
          summary: weeklySummary,
        });

        console.log(`Posted weekly summary for week ${weekNumber}: ${weekRange.format()}`);
        weeksWithPosts++;
      }

      currentWeekStart = addWeeks(currentWeekStart, 1);
    }

    return weeksWithPosts;
  }

  /**
   * Generate monthly summaries for all months that have weekly summaries
   */
  private async generateAllMonthlySummaries(year: number, channel: SlackChannel): Promise<void> {
    // Fetch all weekly summaries
    const allWeeklySummaries = await this.slackRepository.fetchSummariesFromThread({
      channel,
      type: SummaryType.WEEKLY,
      year,
    });

    // Group by month and generate monthly summaries
    for (let month = 1; month <= 12; month++) {
      const relevantSummaries = allWeeklySummaries.filter((summary) =>
        summary.overlapsWithMonth(year, month)
      );

      if (relevantSummaries.length === 0) {
        console.log(`No weekly summaries for ${year}/${month}, skipping monthly summary`);
        continue;
      }

      const monthRange = DateRange.forMonth(new Date(year, month - 1, 1));
      const generated = await this.aiService.generateMonthlySummary(relevantSummaries);

      const monthlySummary = Summary.createMonthly({
        content: generated.content,
        dateRange: monthRange,
        year,
        month,
      });

      await this.slackRepository.postSummaryToThread({
        channel,
        summary: monthlySummary,
      });

      console.log(`Posted monthly summary for ${year}/${month}`);
    }
  }
}

export interface GenerateYearlySummaryParams {
  year: number;
  channel: SlackChannel;
  userId: string;
}
