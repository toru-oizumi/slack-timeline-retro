import { DateRange, Post, type SlackChannel, Summary, SummaryType } from '@/domain';
import type { IAIService, ISlackRepository } from '@/domain';
import { PostsNotFoundError, type Result, err, ok } from '@/shared/errors';
import { getWeek } from 'date-fns';

/**
 * Weekly summary generation use case
 */
export class GenerateWeeklySummary {
  constructor(
    private readonly slackRepository: ISlackRepository,
    private readonly aiService: IAIService
  ) {}

  /**
   * Generate and post a weekly summary
   */
  async execute(params: GenerateWeeklySummaryParams): Promise<Result<Summary, Error>> {
    try {
      // 1. Calculate date range
      const dateRange = DateRange.forWeek(params.targetDate);

      // 2. Fetch user posts
      const posts = await this.slackRepository.fetchUserPosts({
        userId: params.userId,
        dateRange,
        channelIds: params.channelIds,
      });

      if (posts.length === 0) {
        return err(new PostsNotFoundError(dateRange.format()));
      }

      // 3. Generate summary with AI
      const generated = await this.aiService.generateWeeklySummary(posts);

      // 4. Create Summary entity
      const weekNumber = getWeek(params.targetDate, { weekStartsOn: 1 });
      const summary = Summary.createWeekly({
        content: generated.content,
        dateRange,
        year: params.year,
        weekNumber,
      });

      // 5. Post to Slack
      const summaryId = await this.slackRepository.postSummaryToThread({
        channel: params.channel,
        summary,
      });

      // 6. Return Summary with ID
      const postedSummary = Summary.createWeekly({
        id: summaryId,
        content: generated.content,
        dateRange,
        year: params.year,
        weekNumber,
      });

      return ok(postedSummary);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GenerateWeeklySummaryParams {
  userId: string;
  targetDate: Date;
  year: number;
  channel: SlackChannel;
  channelIds?: string[];
}
