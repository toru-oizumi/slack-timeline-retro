import { WebClient } from '@slack/web-api';
import type { ISlackRepository, SlackChannelInfo, SlackUserInfo } from '@/domain';
import {
  type DateRange,
  Post,
  parseSummaryType,
  type SlackChannel,
  type Summary,
  type SummaryType,
} from '@/domain';
import type { WorkspaceConfig } from '@/shared/config';
import { SlackAPIError } from '@/shared/errors';
import { getLocaleStrings, type Locale } from '../config';
import { SlackMessageParser } from './SlackMessageParser';

/**
 * Slack repository implementation
 */
export class SlackRepository implements ISlackRepository {
  private readonly client: WebClient;
  private readonly parser: SlackMessageParser;
  private readonly workspaceConfig: WorkspaceConfig;
  private readonly locale: Locale;

  constructor(botToken: string, workspaceConfig: WorkspaceConfig, locale: Locale = 'en_US') {
    this.client = new WebClient(botToken);
    this.parser = new SlackMessageParser();
    this.workspaceConfig = workspaceConfig;
    this.locale = locale;
  }

  async fetchUserPosts(params: {
    userId: string;
    dateRange: DateRange;
    channelIds?: string[];
  }): Promise<Post[]> {
    const { userId, dateRange, channelIds } = params;
    const allPosts: Post[] = [];

    // If channel IDs are not specified, get joined channels with filtering
    const targetChannels = channelIds ?? (await this.getFilteredChannelIds(userId));

    for (const channelId of targetChannels) {
      try {
        const posts = await this.fetchChannelPosts(channelId, userId, dateRange);
        allPosts.push(...posts);
      } catch {
        // Skip channels without access permission
      }
    }

    // Sort by timestamp
    return allPosts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get filtered channel IDs based on workspace configuration
   */
  private async getFilteredChannelIds(userId: string): Promise<string[]> {
    const channels = await this.getJoinedChannels(userId);

    // Apply workspace configuration filters
    const filteredChannels = channels.filter((ch) => {
      // Check exclude list first (takes precedence)
      if (this.workspaceConfig.excludeChannels.length > 0) {
        if (
          this.workspaceConfig.excludeChannels.includes(ch.name) ||
          this.workspaceConfig.excludeChannels.includes(ch.id)
        ) {
          return false;
        }
      }

      // Check include list (if specified, only include those channels)
      if (this.workspaceConfig.includeChannels.length > 0) {
        if (
          !this.workspaceConfig.includeChannels.includes(ch.name) &&
          !this.workspaceConfig.includeChannels.includes(ch.id)
        ) {
          return false;
        }
      }

      // Filter by channel type
      if (ch.isPrivate && !this.workspaceConfig.includePrivateChannels) {
        return false;
      }

      return true;
    });

    return filteredChannels.map((ch) => ch.id);
  }

  private async fetchChannelPosts(
    channelId: string,
    userId: string,
    dateRange: DateRange
  ): Promise<Post[]> {
    const posts: Post[] = [];
    let cursor: string | undefined;

    const oldest = (dateRange.start.getTime() / 1000).toString();
    const latest = (dateRange.end.getTime() / 1000).toString();

    do {
      const response = await this.client.conversations.history({
        channel: channelId,
        oldest,
        latest,
        limit: 200,
        cursor,
      });

      if (!response.ok) {
        throw new SlackAPIError('conversations.history failed', response.error);
      }

      const messages = response.messages ?? [];
      for (const msg of messages) {
        if (msg.user === userId && msg.text && msg.ts) {
          posts.push(
            Post.create({
              id: msg.ts,
              userId: msg.user,
              text: msg.text,
              timestamp: new Date(Number.parseFloat(msg.ts) * 1000),
              channelId,
              threadTs: msg.thread_ts,
            })
          );
        }
      }

      cursor = response.response_metadata?.next_cursor;
    } while (cursor);

    return posts;
  }

  async fetchSummariesFromThread(params: {
    channel: SlackChannel;
    type: SummaryType;
    year: number;
  }): Promise<Summary[]> {
    const { channel, type, year } = params;

    if (!channel.threadTs) {
      throw new SlackAPIError('Thread ts is not specified');
    }

    const response = await this.client.conversations.replies({
      channel: channel.channelId,
      ts: channel.threadTs,
      limit: 1000,
    });

    if (!response.ok) {
      throw new SlackAPIError('conversations.replies failed', response.error);
    }

    const summaries: Summary[] = [];
    const messages = response.messages ?? [];

    for (const msg of messages) {
      if (!msg.text || !msg.ts) continue;

      const parsedType = parseSummaryType(msg.text);
      if (parsedType !== type) continue;

      // Year validation
      if (!msg.text.includes(`_${year}]`)) continue;

      const parsed = this.parser.parseSummaryMessage(msg.text, msg.ts, year);
      if (parsed) {
        summaries.push(parsed);
      }
    }

    return summaries;
  }

  /**
   * Open a DM channel with a user
   * Returns the channel ID that the bot can use to send messages
   */
  async openDMChannel(userId: string): Promise<string> {
    const response = await this.client.conversations.open({
      users: userId,
    });

    if (!response.ok || !response.channel?.id) {
      throw new SlackAPIError('conversations.open failed', response.error);
    }

    return response.channel.id;
  }

  /**
   * Post a start message to create a new thread
   * Returns the message ts which can be used as thread_ts for subsequent replies
   */
  async postStartMessage(params: { channelId: string; text: string }): Promise<string> {
    const { channelId, text } = params;

    const response = await this.client.chat.postMessage({
      channel: channelId,
      text,
      mrkdwn: true,
    });

    if (!response.ok || !response.ts) {
      throw new SlackAPIError('chat.postMessage failed', response.error);
    }

    return response.ts;
  }

  async postSummaryToThread(params: { channel: SlackChannel; summary: Summary }): Promise<string> {
    const { channel, summary } = params;
    const localeStrings = getLocaleStrings(this.locale);

    const response = await this.client.chat.postMessage({
      channel: channel.channelId,
      thread_ts: channel.threadTs,
      text: summary.toSlackMessage(localeStrings.periodLabel),
      mrkdwn: true,
    });

    if (!response.ok || !response.ts) {
      throw new SlackAPIError('chat.postMessage failed', response.error);
    }

    return response.ts;
  }

  async broadcastSummary(params: { channel: SlackChannel; summary: Summary }): Promise<string> {
    const { channel, summary } = params;
    const localeStrings = getLocaleStrings(this.locale);

    // reply_broadcast requires thread_ts to be set
    if (!channel.threadTs) {
      throw new SlackAPIError('broadcastSummary requires thread_ts', 'MISSING_THREAD_TS');
    }

    const response = await this.client.chat.postMessage({
      channel: channel.channelId,
      thread_ts: channel.threadTs,
      text: summary.toSlackMessage(localeStrings.periodLabel),
      reply_broadcast: true, // Also display in channel
      mrkdwn: true,
    });

    if (!response.ok || !response.ts) {
      throw new SlackAPIError('chat.postMessage (broadcast) failed', response.error);
    }

    return response.ts;
  }

  async getUserInfo(userId: string): Promise<SlackUserInfo> {
    const response = await this.client.users.info({ user: userId });

    if (!response.ok || !response.user) {
      throw new SlackAPIError('users.info failed', response.error);
    }

    return {
      id: response.user.id ?? userId,
      name: response.user.name ?? '',
      realName: response.user.real_name ?? '',
    };
  }

  async getJoinedChannels(userId: string): Promise<SlackChannelInfo[]> {
    const channels: SlackChannelInfo[] = [];
    let cursor: string | undefined;

    // Build channel types based on workspace configuration
    const types = this.buildChannelTypes();

    do {
      const response = await this.client.users.conversations({
        user: userId,
        types,
        limit: 200,
        cursor,
      });

      if (!response.ok) {
        throw new SlackAPIError('users.conversations failed', response.error);
      }

      for (const ch of response.channels ?? []) {
        if (ch.id && ch.name) {
          channels.push({
            id: ch.id,
            name: ch.name,
            isPrivate: ch.is_private ?? false,
          });
        }
      }

      cursor = response.response_metadata?.next_cursor;
    } while (cursor);

    return channels;
  }

  /**
   * Build channel types string based on workspace configuration
   */
  private buildChannelTypes(): string {
    const types: string[] = ['public_channel'];

    if (this.workspaceConfig.includePrivateChannels) {
      types.push('private_channel');
    }

    if (this.workspaceConfig.includeDirectMessages) {
      types.push('im');
    }

    if (this.workspaceConfig.includeGroupMessages) {
      types.push('mpim');
    }

    return types.join(',');
  }
}
