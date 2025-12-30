import { addWeeks, getWeek, startOfWeek } from 'date-fns';
import type { IAIService, ISlackRepository } from '@/domain';
import { DateRange, type SlackChannel, Summary, SummaryType } from '@/domain';
import { err, ok, PostsNotFoundError, type Result, SummaryNotFoundError } from '@/shared/errors';

/**
 * Monthly summary generation use case
 *
 * New flow:
 * 1. Calculate all weeks that overlap with the target month
 * 2. For each week, generate weekly summary from posts and post to thread
 * 3. Fetch all weekly summaries from thread
 * 4. Generate monthly summary from weekly summaries
 */
export class GenerateMonthlySummary {
  constructor(
    private readonly slackRepository: ISlackRepository,
    private readonly aiService: IAIService
  ) {}

  /**
   * Generate and post a monthly summary
   *
   * First generates weekly summaries for all weeks in the month,
   * then aggregates them into a monthly summary.
   */
  async execute(params: GenerateMonthlySummaryParams): Promise<Result<Summary, Error>> {
    try {
      // 1. Calculate month date range
      const targetDate = new Date(params.year, params.month - 1, 1);
      const monthRange = DateRange.forMonth(targetDate);

      // 2. Calculate all weeks that overlap with this month
      const weeks = this.getWeeksInMonth(params.year, params.month);

      // 3. Generate weekly summaries for each week
      let hasAnyPosts = false;
      for (const weekDate of weeks) {
        const weekRange = DateRange.forWeek(weekDate);

        // Fetch user posts for this week
        const posts = await this.slackRepository.fetchUserPosts({
          userId: params.userId,
          dateRange: weekRange,
        });

        if (posts.length === 0) {
          console.log(`No posts found for week: ${weekRange.format()}`);
          continue;
        }

        hasAnyPosts = true;

        // Generate weekly summary with AI
        const generated = await this.aiService.generateWeeklySummary(posts);

        // Create and post weekly summary
        const weekNumber = getWeek(weekDate, { weekStartsOn: 1 });
        const weeklySummary = Summary.createWeekly({
          content: generated.content,
          dateRange: weekRange,
          year: params.year,
          weekNumber,
        });

        await this.slackRepository.postSummaryToThread({
          channel: params.channel,
          summary: weeklySummary,
        });

        console.log(`Posted weekly summary for week ${weekNumber}: ${weekRange.format()}`);
      }

      if (!hasAnyPosts) {
        return err(new PostsNotFoundError(`${params.year}/${params.month}`));
      }

      // 4. Fetch weekly summaries from thread
      const allWeeklySummaries = await this.slackRepository.fetchSummariesFromThread({
        channel: params.channel,
        type: SummaryType.WEEKLY,
        year: params.year,
      });

      // 5. Filter weekly summaries that overlap with the target month
      const relevantSummaries = allWeeklySummaries.filter((summary) =>
        summary.overlapsWithMonth(params.year, params.month)
      );

      if (relevantSummaries.length === 0) {
        return err(new SummaryNotFoundError('weekly', `${params.year}/${params.month}`));
      }

      // 6. Generate monthly summary with AI
      const generated = await this.aiService.generateMonthlySummary(relevantSummaries);

      // 7. Create Summary entity
      const summary = Summary.createMonthly({
        content: generated.content,
        dateRange: monthRange,
        year: params.year,
        month: params.month,
      });

      // 8. Post to Slack
      const summaryId = await this.slackRepository.postSummaryToThread({
        channel: params.channel,
        summary,
      });

      // 9. Return Summary with ID
      const postedSummary = Summary.createMonthly({
        id: summaryId,
        content: generated.content,
        dateRange: monthRange,
        year: params.year,
        month: params.month,
      });

      return ok(postedSummary);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get all week start dates that overlap with the given month
   */
  private getWeeksInMonth(year: number, month: number): Date[] {
    const weeks: Date[] = [];
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // Last day of month

    // Start from the week containing the first day of the month
    let currentWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 });

    while (currentWeekStart <= monthEnd) {
      weeks.push(new Date(currentWeekStart));
      currentWeekStart = addWeeks(currentWeekStart, 1);
    }

    return weeks;
  }
}

export interface GenerateMonthlySummaryParams {
  year: number;
  month: number; // 1-12
  channel: SlackChannel;
  userId: string;
}
