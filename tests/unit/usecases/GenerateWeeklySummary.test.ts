import { DateRange, Post, SlackChannel, Summary } from '@/domain';
import type { GeneratedContent, IAIService, ISlackRepository } from '@/domain';
import { GenerateWeeklySummary } from '@/usecases/GenerateWeeklySummary';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('GenerateWeeklySummary', () => {
  let mockSlackRepository: ISlackRepository;
  let mockAIService: IAIService;
  let usecase: GenerateWeeklySummary;

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

    usecase = new GenerateWeeklySummary(mockSlackRepository, mockAIService);
  });

  it('should successfully generate weekly summary', async () => {
    // Mock data
    const posts = [
      Post.create({
        id: '1',
        userId: 'U12345',
        text: 'テスト投稿1',
        timestamp: new Date(2025, 0, 8),
        channelId: 'C12345',
      }),
      Post.create({
        id: '2',
        userId: 'U12345',
        text: 'テスト投稿2',
        timestamp: new Date(2025, 0, 9),
        channelId: 'C12345',
      }),
    ];

    const generatedContent: GeneratedContent = {
      content: '## 今週のハイライト\n- テスト項目',
      metadata: {
        tokensUsed: 100,
        model: 'claude-3-5-sonnet',
        generatedAt: new Date(),
      },
    };

    vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue(posts);
    vi.mocked(mockAIService.generateWeeklySummary).mockResolvedValue(generatedContent);
    vi.mocked(mockSlackRepository.postSummaryToThread).mockResolvedValue('12345.67890');

    // Execute
    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      userId: 'U12345',
      targetDate: new Date(2025, 0, 8),
      year: 2025,
      channel,
    });

    // Verify
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('weekly');
      expect(result.value.id).toBe('12345.67890');
    }

    expect(mockSlackRepository.fetchUserPosts).toHaveBeenCalledOnce();
    expect(mockAIService.generateWeeklySummary).toHaveBeenCalledWith(posts);
    expect(mockSlackRepository.postSummaryToThread).toHaveBeenCalledOnce();
  });

  it('should return error when no posts found', async () => {
    vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue([]);

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      userId: 'U12345',
      targetDate: new Date(2025, 0, 8),
      year: 2025,
      channel,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No posts found');
    }
  });

  it('should handle AI generation errors properly', async () => {
    const posts = [
      Post.create({
        id: '1',
        userId: 'U12345',
        text: 'テスト投稿',
        timestamp: new Date(2025, 0, 8),
        channelId: 'C12345',
      }),
    ];

    vi.mocked(mockSlackRepository.fetchUserPosts).mockResolvedValue(posts);
    vi.mocked(mockAIService.generateWeeklySummary).mockRejectedValue(
      new Error('AI生成に失敗しました')
    );

    const channel = SlackChannel.createDM('D12345', '1736000000.000000');
    const result = await usecase.execute({
      userId: 'U12345',
      targetDate: new Date(2025, 0, 8),
      year: 2025,
      channel,
    });

    expect(result.ok).toBe(false);
  });
});
