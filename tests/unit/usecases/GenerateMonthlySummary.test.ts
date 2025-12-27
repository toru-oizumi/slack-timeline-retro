import { DateRange, SlackChannel, Summary, SummaryType } from '@/domain';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { GenerateMonthlySummary } from '@/usecases/GenerateMonthlySummary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('GenerateMonthlySummary', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let usecase: GenerateMonthlySummary;

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

  it('should successfully generate monthly summary', async () => {
    // Mock weekly summaries related to January
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
      // Week of 1/27 - 2/2 (overlaps January and February)
      Summary.createWeekly({
        id: '3',
        content: '月境の週のサマリー',
        dateRange: DateRange.create(new Date(2025, 0, 27), new Date(2025, 1, 2)),
        year: 2025,
        weekNumber: 5,
      }),
    ];

    const generatedContent: GeneratedContent = {
      content: '## 1月のハイライト\n- 成果1\n- 成果2',
      metadata: {
        tokensUsed: 200,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue(weeklySummaries);
    vi.mocked(mockAIService.generateMonthlySummary).mockResolvedValue(generatedContent);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('monthly.12345');

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1,
      channel,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('monthly');
      expect(result.value.month).toBe(1);
      expect(result.value.id).toBe('monthly.12345');
    }

    // All 3 weekly summaries are related to January, so all should be passed
    expect(mockAIService.generateMonthlySummary).toHaveBeenCalledWith(
      expect.arrayContaining(weeklySummaries)
    );
  });

  it('should return error when no weekly summaries found', async () => {
    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue([]);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1,
      channel,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('weekly summary not found');
    }
  });

  it('should exclude weekly summaries that do not overlap with month', async () => {
    // Only March weekly summaries
    const weeklySummaries = [
      Summary.createWeekly({
        id: '1',
        content: '3月のサマリー',
        dateRange: DateRange.create(new Date(2025, 2, 3), new Date(2025, 2, 9)),
        year: 2025,
        weekNumber: 10,
      }),
    ];

    vi.mocked(mockSlackRepository.fetchSummariesFromThread).mockResolvedValue(weeklySummaries);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      year: 2025,
      month: 1, // Request January
      channel,
    });

    // Error because no weekly summaries overlap with January
    expect(result.ok).toBe(false);
  });
});
