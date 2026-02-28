import type { Post } from '../entities/Post';
import type { Summary } from '../entities/Summary';
import type { Thread } from '../entities/Thread';
import type { DateRange } from '../value-objects/DateRange';
import type { SlackChannel } from '../value-objects/SlackChannel';
import type { SummaryType } from '../value-objects/SummaryType';

/**
 * Repository interface for Slack operations
 */
export interface ISlackRepository {
  /**
   * Fetch user posts within the given date range
   */
  fetchUserPosts(params: {
    userId: string;
    dateRange: DateRange;
    channelIds?: string[];
  }): Promise<Post[]>;

  /**
   * Fetch past summaries from thread
   */
  fetchSummariesFromThread(params: {
    channel: SlackChannel;
    type: SummaryType;
    year: number;
  }): Promise<Summary[]>;

  /**
   * Post summary to thread as a reply
   */
  postSummaryToThread(params: { channel: SlackChannel; summary: Summary }): Promise<string>;

  /**
   * Post summary to thread and broadcast to channel (reply_broadcast)
   */
  broadcastSummary(params: { channel: SlackChannel; summary: Summary }): Promise<string>;

  /**
   * Get user info
   */
  getUserInfo(userId: string): Promise<SlackUserInfo>;

  /**
   * Get channels the user has joined
   */
  getJoinedChannels(userId: string): Promise<SlackChannelInfo[]>;

  /**
   * Fetch sampled threads from a channel within the given date range.
   * Used for org culture analysis.
   */
  fetchChannelThreads(params: {
    channelId: string;
    dateRange: DateRange;
    sampling: ThreadSamplingConfig;
  }): Promise<Thread[]>;
}

/**
 * Slack user info
 */
export interface SlackUserInfo {
  id: string;
  name: string;
  realName: string;
}

/**
 * Slack channel info
 */
export interface SlackChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
}

/**
 * Sampling configuration for fetchChannelThreads.
 * Mirrors pipeline SamplingConfig but kept in domain to avoid layer violation.
 */
export interface ThreadSamplingConfig {
  strategy: 'top_engaged' | 'random' | 'recent';
  maxThreadsPerWeek: number;
}
