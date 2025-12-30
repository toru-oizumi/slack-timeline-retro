import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { DateRange, Post, SlackChannel, Summary } from '@/domain';
import { GenerateMonthlySummary } from '@/usecases/GenerateMonthlySummary';

describe('GenerateMonthlySummary', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let usecase: GenerateMonthlySummary;

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

    usecase = new GenerateMonthlySummary(mockSlackRepository, mockAIService);
  });

  it('should successfully generate monthly summary by first generating weekly summaries', async () => {
    // Mock posts for first week of January
    const postsWeek1 = [
      Post.create({
        id: 'p1',
        userId: mockUserId,
        text: 'Week 1 post',
        timestamp: new Date(2025, 0, 7),
        channelId: 'C123',
      }),
    ];

    // Mock posts for second week of January
    const postsWeek2 = [
      Post.create({
        id: 'p2',
        userId: mockUserId,
        text: 'Week 2 post',
        timestamp: new Date(2025, 0, 14),
        channelId: 'C123',
      }),
    ];

    // Mock weekly summaries that will be returned from thread
    const weeklySummaries = [
      Summary.createWeekly({
        id: '1',
        content: '第1週のサマリー',
        dateRange: DateRange.create(new Date(2025, 0, 6), new Date(2025, 0, 12)),
        year: 2025,
        weekNumber: 2,
      }),
      Summary.createWeekly({
        id: '2',
        content: '第2週のサマリー',
        dateRange: DateRange.create(new Date(2025, 0, 13), new Date(2025, 0, 19)),
        year: 2025,
        weekNumber: 3,
      }),
    ];

    const weeklyGeneratedContent: GeneratedContent = {
      content: '週次サマリー',
      metadata: {
        tokensUsed: 100,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    const monthlyGeneratedContent: GeneratedContent = {
      content: '## 1月のハイライト\n- 成果1\n- 成果2',
      metadata: {
        tokensUsed: 200,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    // Mock fetchUserPosts to return posts for some weeks
    vi.mocked(mockSlackRepository.fetchUserPosts).mockImplementation(async (params) => {
      const weekStart = params.dateRange.start;
      // Return posts for first two weeks of January
      if (weekStart.getMonth() === 0 && weekStart.getDate() <= 6) {
        return postsWeek1;
      }
      if (weekStart.getMonth() === 0 && weekStart.getDate() > 6 && weekStart.getDate() <= 13) {
        return postsWeek2;
      }
      return [];
    });

    vi.mocked(mockAIService.generateWeeklySummary).mockResolvedValue(weeklyGeneratedContent);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('summary.12345');
    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue(weeklySummaries);
    vi.mocked(mockAIService.generateMonthlySummary).mockResolvedValue(monthlyGeneratedContent);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1,
      channel,
      userId: mockUserId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('monthly');
      expect(result.value.month).toBe(1);
    }

    // Should have generated weekly summaries
    expect(mockAIService.generateWeeklySummary).toHaveBeenCalled();
    // Should have generated monthly summary from weekly summaries
    expect(mockAIService.generateMonthlySummary).toHaveBeenCalled();
  });

  it('should return error when no posts found for any week', async () => {
    vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue([]);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1,
      channel,
      userId: mockUserId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No posts found');
    }
  });

  it('should only generate weekly summaries for weeks with posts', async () => {
    // Only return posts for week 2
    const postsWeek2 = [
      Post.create({
        id: 'p1',
        userId: mockUserId,
        text: 'Week 2 post',
        timestamp: new Date(2025, 0, 14),
        channelId: 'C123',
      }),
    ];

    const weeklySummary = Summary.createWeekly({
      id: '1',
      content: '第2週のサマリー',
      dateRange: DateRange.create(new Date(2025, 0, 13), new Date(2025, 0, 19)),
      year: 2025,
      weekNumber: 3,
    });

    vi.mocked(mockSlackRepository.fetchUserPosts).mockImplementation(async (params) => {
      const weekStart = params.dateRange.start;
      // Only return posts for week starting Jan 13
      if (weekStart.getMonth() === 0 && weekStart.getDate() === 13) {
        return postsWeek2;
      }
      return [];
    });

    const weeklyGeneratedContent: GeneratedContent = {
      content: '週次サマリー',
      metadata: { tokensUsed: 100, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    const monthlyGeneratedContent: GeneratedContent = {
      content: '月次サマリー',
      metadata: { tokensUsed: 200, model: 'claude-3-5-sonnet', generatedAt: new Date() },
    };

    vi.mocked(mockAIService.generateWeeklySummary).mockResolvedValue(weeklyGeneratedContent);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('summary.12345');
    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue([weeklySummary]);
    vi.mocked(mockAIService.generateMonthlySummary).mockResolvedValue(monthlyGeneratedContent);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1,
      channel,
      userId: mockUserId,
    });

    expect(result.ok).toBe(true);
    // Weekly summary should only be called once (for the week with posts)
    expect(mockAIService.generateWeeklySummary).toHaveBeenCalledTimes(1);
  });
});
