import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { DateRange, Post, SlackChannel, Summary, SummaryType } from '@/domain';
import { GenerateYearlySummary } from '@/usecases/GenerateYearlySummary';

describe('GenerateYearlySummary', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let usecase: GenerateYearlySummary;

  const mockUserId = 'U12345';

  beforeEach(() => {
    mockSlackRepository = {
      fetchUserPosts: vi.fn(),
      fetchSummariesFromThread: vi.fn(),
      postSummaryToThread: vi.fn(),
      broadcastSummary: vi.fn(),
      getUserInfo: vi.fn(),
      getJoinedChannels: vi.fn(),
    };

    mockAIService = {
      generateWeeklySummary: vi.fn(),
      generateMonthlySummary: vi.fn(),
      generateYearlySummary: vi.fn(),
    };

    usecase = new GenerateYearlySummary(mockSlackRepository, mockAIService);
  });

  it('should successfully generate yearly summary by generating weekly and monthly summaries first', async () => {
    // Mock posts for January
    const janPosts = [
      Post.create({
        id: 'p1',
        userId: mockUserId,
        text: 'January post',
        timestamp: new Date(2025, 0, 15),
        channelId: 'C123',
      }),
    ];

    // Mock weekly summaries returned from thread
    const weeklySummaries = [
      Summary.createWeekly({
        id: 'w1',
        content: '1月第3週',
        dateRange: DateRange.create(new Date(2025, 0, 13), new Date(2025, 0, 19)),
        year: 2025,
        weekNumber: 3,
      }),
    ];

    // Mock monthly summaries returned from thread
    const monthlySummaries = [
      Summary.createMonthly({
        id: 'm1',
        content: '1月のサマリー',
        dateRange: DateRange.forMonth(new Date(2025, 0, 1)),
        year: 2025,
        month: 1,
      }),
    ];

    const weeklyContent: GeneratedContent = {
      content: '週次サマリー',
      metadata: { tokensUsed: 100, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    const monthlyContent: GeneratedContent = {
      content: '月次サマリー',
      metadata: { tokensUsed: 200, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    const yearlyContent: GeneratedContent = {
      content: '# 2025年 活動サマリー\n## 年間ハイライト\n- 成果1',
      metadata: { tokensUsed: 500, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    // Mock fetchUserPosts to return posts for one week
    vi.mocked(mockSlackRepository.fetchUserPosts).mockImplementation(async (params) => {
      const weekStart = params.dateRange.start;
      if (weekStart.getMonth() === 0 && weekStart.getDate() === 13) {
        return janPosts;
      }
      return [];
    });

    // Mock fetchSummariesFromThread based on type
    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockImplementation(async (params) => {
      if (params.type === SummaryType.WEEKLY) {
        return weeklySummaries;
      }
      if (params.type === SummaryType.MONTHLY) {
        return monthlySummaries;
      }
      return [];
    });

    vi.mocked(mockAIService.generateWeeklySummary).mockResolvedValue(weeklyContent);
    vi.mocked(mockAIService.generateMonthlySummary).mockResolvedValue(monthlyContent);
    vi.mocked(mockAIService.generateYearlySummary).mockResolvedValue(yearlyContent);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('summary.12345');
    vi.mocked(mockSlackRepository.broadcastSummary).mockResolvedValue('yearly.12345');

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      channel,
      userId: mockUserId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('yearly');
      expect(result.value.id).toBe('yearly.12345');
    }

    // Should have generated weekly, monthly, and yearly summaries
    expect(mockAIService.generateWeeklySummary).toHaveBeenCalled();
    expect(mockAIService.generateMonthlySummary).toHaveBeenCalled();
    expect(mockAIService.generateYearlySummary).toHaveBeenCalled();

    // Should broadcast the yearly summary
    expect(mockSlackRepository.broadcastSummary).toHaveBeenCalledOnce();
  });

  it('should return error when no posts found for entire year', async () => {
    vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue([]);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      channel,
      userId: mockUserId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No posts found');
    }
  });

  it('should pass monthly summaries sorted by month to yearly generation', async () => {
    // Mock minimal posts
    const posts = [
      Post.create({
        id: 'p1',
        userId: mockUserId,
        text: 'Post',
        timestamp: new Date(2025, 0, 15),
        channelId: 'C123',
      }),
    ];

    // Mock weekly summaries
    const weeklySummaries = [
      Summary.createWeekly({
        id: 'w1',
        content: '週次',
        dateRange: DateRange.create(new Date(2025, 0, 13), new Date(2025, 0, 19)),
        year: 2025,
        weekNumber: 3,
      }),
      Summary.createWeekly({
        id: 'w2',
        content: '週次',
        dateRange: DateRange.create(new Date(2025, 2, 3), new Date(2025, 2, 9)),
        year: 2025,
        weekNumber: 10,
      }),
    ];

    // Monthly summaries in random order
    const monthlySummaries = [
      Summary.createMonthly({
        id: '3',
        content: '3月のサマリー',
        dateRange: DateRange.forMonth(new Date(2025, 2, 1)),
        year: 2025,
        month: 3,
      }),
      Summary.createMonthly({
        id: '1',
        content: '1月のサマリー',
        dateRange: DateRange.forMonth(new Date(2025, 0, 1)),
        year: 2025,
        month: 1,
      }),
    ];

    const content: GeneratedContent = {
      content: 'サマリー',
      metadata: { tokensUsed: 100, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    vi.mocked(mockSlackRepository.fetchUserPosts).mockImplementation(async (params) => {
      const weekStart = params.dateRange.start;
      if (
        (weekStart.getMonth() === 0 && weekStart.getDate() === 13) ||
        (weekStart.getMonth() === 2 && weekStart.getDate() === 3)
      ) {
        return posts;
      }
      return [];
    });

    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockImplementation(async (params) => {
      if (params.type === SummaryType.WEEKLY) {
        return weeklySummaries;
      }
      if (params.type === SummaryType.MONTHLY) {
        return monthlySummaries;
      }
      return [];
    });

    vi.mocked(mockAIService.generateWeeklySummary).mockResolvedValue(content);
    vi.mocked(mockAIService.generateMonthlySummary).mockResolvedValue(content);
    vi.mocked(mockAIService.generateYearlySummary).mockResolvedValue(content);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('summary.12345');
    vi.mocked(mockSlackRepository.broadcastSummary).mockResolvedValue('yearly.12345');

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    await usecase.execute({
      year: 2025,
      channel,
      userId: mockUserId,
    });

    // Verify monthly summaries are passed in sorted order
    const callArg = vi.mocked(mockAIService.generateYearlySummary).mock.calls[0][0];
    expect(callArg[0].month).toBe(1);
    expect(callArg[1].month).toBe(3);
  });
});
