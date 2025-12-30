import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { DateRange, SlackChannel, Summary } from '@/domain';
import { GenerateYearlySummary } from '@/usecases/GenerateYearlySummary';

describe('GenerateYearlySummary', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let usecase: GenerateYearlySummary;

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

  it('should successfully generate and broadcast yearly summary', async () => {
    // Mock 12 months of monthly summaries
    const monthlySummaries = Array.from({ length: 12 }, (_, i) =>
      Summary.createMonthly({
        id: `monthly_${i + 1}`,
        content: `${i + 1}月のサマリー`,
        dateRange: DateRange.forMonth(new Date(2025, i, 1)),
        year: 2025,
        month: i + 1,
      })
    );

    const generatedContent: GeneratedContent = {
      content: '# 2025年 活動サマリー\n## 年間ハイライト\n- 成果1',
      metadata: {
        tokensUsed: 500,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue(monthlySummaries);
    vi.mocked(mockAIService.generateYearlySummary).mockResolvedValue(generatedContent);
    vi.mocked(mockSlackRepository.broadcastSummary).mockResolvedValue('yearly.12345');

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      channel,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('yearly');
      expect(result.value.id).toBe('yearly.12345');
    }

    // Verify broadcastSummary (reply_broadcast: true) was called
    expect(mockSlackRepository.broadcastSummary).toHaveBeenCalledOnce();
    expect(mockSlackRepository.postSummaryToThread).not.toHaveBeenCalled();
  });

  it('should pass monthly summaries sorted by month', async () => {
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
      Summary.createMonthly({
        id: '2',
        content: '2月のサマリー',
        dateRange: DateRange.forMonth(new Date(2025, 1, 1)),
        year: 2025,
        month: 2,
      }),
    ];

    const generatedContent: GeneratedContent = {
      content: '年次サマリー',
      metadata: {
        tokensUsed: 300,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue(monthlySummaries);
    vi.mocked(mockAIService.generateYearlySummary).mockResolvedValue(generatedContent);
    vi.mocked(mockSlackRepository.broadcastSummary).mockResolvedValue('yearly.12345');

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    await usecase.execute({
      year: 2025,
      channel,
    });

    // Verify they are passed in sorted order
    const callArg = vi.mocked(mockAIService.generateYearlySummary).mock.calls[0][0];
    expect(callArg[0].month).toBe(1);
    expect(callArg[1].month).toBe(2);
    expect(callArg[2].month).toBe(3);
  });

  it('should return error when no monthly summaries found', async () => {
    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue([]);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      channel,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('monthly summary not found');
    }
  });
});
