import type { Post } from '../entities/Post';
import type { Summary } from '../entities/Summary';
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
