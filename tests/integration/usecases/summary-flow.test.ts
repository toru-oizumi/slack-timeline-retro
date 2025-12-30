import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { DateRange, Post, SlackChannel, Summary, SummaryType } from '@/domain';
import { GenerateMonthlySummary } from '@/usecases/GenerateMonthlySummary';
import { GenerateWeeklySummary } from '@/usecases/GenerateWeeklySummary';
import { GenerateYearlySummary } from '@/usecases/GenerateYearlySummary';

/**
 * Integration test for Weekly -> Monthly -> Yearly flow
 */
describe('Summary Generation Flow', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let channel: SlackChannel;
  let postedSummaries: Summary[];

  beforeEach(() => {
    postedSummaries = [];

    mockSlackRepository = {
      fetchUserPosts: vi.fn(),
      fetchSummariesFromThread: vi.fn().mockImplementation(({ type }) => {
        // Return posted summaries of matching type
        return Promise.resolve(postedSummaries.filter((s) => s.type === type));
      }),
      postSummaryToThread: vi.fn().mockImplementation(({ summary }) => {
        const id = `${Date.now()}.${Math.random().toString(36)}`;
        postedSummaries.push(
          Summary.fromSlackMessage({
            id,
            type: summary.type,
            content: summary.content,
            dateRange: summary.dateRange,
            year: summary.year,
            month: summary.month,
            weekNumber: summary.weekNumber,
          })
        );
        return Promise.resolve(id);
      }),
      broadcastSummary: vi.fn().mockImplementation(({ summary }) => {
        const id = `broadcast.${Date.now()}`;
        postedSummaries.push(
          Summary.fromSlackMessage({
            id,
            type: summary.type,
            content: summary.content,
            dateRange: summary.dateRange,
            year: summary.year,
          })
        );
        return Promise.resolve(id);
      }),
      getUserInfo: vi.fn(),
      getJoinedChannels: vi.fn(),
    };

    mockAIService = {
      generateWeeklySummary: vi.fn().mockResolvedValue({
        content: '週次サマリーコンテンツ',
        metadata: { tokensUsed: 100, model: 'test', generatedAt: new Date() },
      } as GeneratedContent),
      generateMonthlySummary: vi.fn().mockResolvedValue({
        content: '月次サマリーコンテンツ',
        metadata: { tokensUsed: 200, model: 'test', generatedAt: new Date() },
      } as GeneratedContent),
      generateYearlySummary: vi.fn().mockResolvedValue({
        content: '年次サマリーコンテンツ',
        metadata: { tokensUsed: 500, model: 'test', generatedAt: new Date() },
      } as GeneratedContent),
    };

    channel = SlackChannel.createDM('D12345', '1736000000.000000');
  });

  it('should generate multiple weekly summaries and consolidate into monthly summary', async () => {
    // Mock posts for each week in January
    const weeks = [
      { date: new Date(2025, 0, 6), weekNum: 2 },
      { date: new Date(2025, 0, 13), weekNum: 3 },
      { date: new Date(2025, 0, 20), weekNum: 4 },
      { date: new Date(2025, 0, 27), weekNum: 5 },
    ];

    // Generate weekly summaries
    const weeklyUsecase = new GenerateWeeklySummary(mockSlackRepository, mockAIService);

    for (const week of weeks) {
      vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue([
        Post.create({
          id: `post_${week.weekNum}`,
          userId: 'U12345',
          text: `週${week.weekNum}の投稿`,
          timestamp: week.date,
          channelId: 'C12345',
        }),
      ]);

      const result = await weeklyUsecase.execute({
        userId: 'U12345',
        targetDate: week.date,
        year: 2025,
        channel,
      });

      expect(result.ok).toBe(true);
    }

    // Verify 4 weekly summaries were posted
    expect(postedSummaries.filter((s) => s.type === SummaryType.WEEKLY).length).toBe(4);

    // Generate monthly summary
    const monthlyUsecase = new GenerateMonthlySummary(mockSlackRepository, mockAIService);
    const monthlyResult = await monthlyUsecase.execute({
      year: 2025,
      month: 1,
      channel,
    });

    expect(monthlyResult.ok).toBe(true);
    expect(postedSummaries.filter((s) => s.type === SummaryType.MONTHLY).length).toBe(1);

    // Verify 4 weekly summaries were passed to monthly summary generation
    expect(mockAIService.generateMonthlySummary).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: SummaryType.WEEKLY })])
    );
  });

  it('should generate 12 monthly summaries and consolidate into yearly summary', async () => {
    // Pre-create 12 monthly summaries
    for (let month = 1; month <= 12; month++) {
      const dateRange = DateRange.forMonth(new Date(2025, month - 1, 1));
      postedSummaries.push(
        Summary.createMonthly({
          id: `monthly_${month}`,
          content: `${month}月のサマリー`,
          dateRange,
          year: 2025,
          month,
        })
      );
    }

    // Generate yearly summary
    const yearlyUsecase = new GenerateYearlySummary(mockSlackRepository, mockAIService);
    const result = await yearlyUsecase.execute({
      year: 2025,
      channel,
    });

    expect(result.ok).toBe(true);

    // Verify broadcastSummary was called (also posts to channel)
    expect(mockSlackRepository.broadcastSummary).toHaveBeenCalledOnce();

    // Verify 12 monthly summaries were passed to yearly summary generation
    expect(mockAIService.generateYearlySummary).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ month: 1 }),
        expect.objectContaining({ month: 12 }),
      ])
    );
  });
});
