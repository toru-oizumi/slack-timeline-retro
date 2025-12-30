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
 * Delay utility for rate limiting
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rate limit configuration
 * Slack Tier 3 APIs: 50+ requests per minute = ~1.2 seconds between requests to be safe
 */
const RATE_LIMIT_DELAY_MS = 1500; // 1.5 seconds between API calls

/**
 * Slack repository implementation
 * Uses bot token for posting and user token for reading
 */
export class SlackRepository implements ISlackRepository {
  private readonly botClient: WebClient;
  private readonly userClient: WebClient;
  private readonly parser: SlackMessageParser;
  private readonly workspaceConfig: WorkspaceConfig;
  private readonly locale: Locale;

  constructor(
    botToken: string,
    workspaceConfig: WorkspaceConfig,
    locale: Locale = 'en_US',
    userToken?: string
  ) {
    const retryConfig = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000,
    };

    // Bot client for posting messages
    this.botClient = new WebClient(botToken, { retryConfig });

    // User client for reading messages (falls back to bot token if no user token)
    this.userClient = new WebClient(userToken ?? botToken, { retryConfig });

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

    // Use search.messages API for efficient fetching (includes thread replies)
    const posts = await this.searchUserMessages(userId, dateRange);

    // Filter by channel IDs if specified
    if (channelIds && channelIds.length > 0) {
      const channelSet = new Set(channelIds);
      const filteredPosts = posts.filter((post) => channelSet.has(post.channelId));
      console.log(`Filtered to ${filteredPosts.length} posts from ${channelIds.length} specified channels`);
      return filteredPosts;
    }

    // Apply workspace channel filters
    const filteredChannelIds = await this.getFilteredChannelIds(userId);
    const channelSet = new Set(filteredChannelIds);
    const filteredPosts = posts.filter((post) => channelSet.has(post.channelId));
    console.log(`Filtered to ${filteredPosts.length} posts from ${filteredChannelIds.length} allowed channels`);

    return filteredPosts;
  }

  /**
   * Search for all messages by a user within a date range
   * Uses search.messages API which includes thread replies
   */
  private async searchUserMessages(userId: string, dateRange: DateRange): Promise<Post[]> {
    const posts: Post[] = [];
    let page = 1;
    let totalPages = 1;

    // Format dates for Slack search query (YYYY-MM-DD)
    const afterDate = this.formatDateForSearch(dateRange.start);
    const beforeDate = this.formatDateForSearch(dateRange.end);

    // Build search query: from user, within date range
    const query = `from:<@${userId}> after:${afterDate} before:${beforeDate}`;
    console.log(`Searching messages with query: ${query}`);

    do {
      const response = await this.userClient.search.messages({
        query,
        sort: 'timestamp',
        sort_dir: 'asc',
        count: 100,
        page,
      });

      if (!response.ok) {
        throw new SlackAPIError(`search.messages failed: ${response.error}`, response.error);
      }

      const messages = response.messages;
      if (!messages?.matches) {
        break;
      }

      totalPages = messages.paging?.pages ?? 1;
      console.log(`  Page ${page}/${totalPages}: ${messages.matches.length} messages`);

      for (const match of messages.matches) {
        if (match.user === userId && match.text && match.ts) {
          posts.push(
            Post.create({
              id: match.ts,
              userId: match.user,
              text: match.text,
              timestamp: new Date(Number.parseFloat(match.ts) * 1000),
              channelId: match.channel?.id ?? '',
              // Note: thread_ts not available in search results, but not needed for aggregation
            })
          );
        }
      }

      page++;

      // Rate limit delay for pagination
      if (page <= totalPages) {
        await delay(RATE_LIMIT_DELAY_MS);
      }
    } while (page <= totalPages);

    console.log(`Found ${posts.length} total messages via search`);

    // Sort by timestamp
    return posts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Format date for Slack search query (YYYY-MM-DD)
   */
  private formatDateForSearch(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  async fetchSummariesFromThread(params: {
    channel: SlackChannel;
    type: SummaryType;
    year: number;
  }): Promise<Summary[]> {
    const { channel, type, year } = params;

    if (!channel.threadTs) {
      throw new SlackAPIError('Thread ts is not specified');
    }

    // Use userClient to read from user's self-DM thread
    const response = await this.userClient.conversations.replies({
      channel: channel.channelId,
      ts: channel.threadTs,
      limit: 1000,
    });

    if (!response.ok) {
      throw new SlackAPIError('conversations.replies failed', response.error);
    }

    const summaries: Summary[] = [];
    const messages = response.messages ?? [];

    console.log(`fetchSummariesFromThread: Found ${messages.length} messages in thread`);

    for (const msg of messages) {
      if (!msg.text || !msg.ts) continue;

      const parsedType = parseSummaryType(msg.text);
      if (parsedType !== type) {
        // Log first 100 chars to help debug - escape newlines
        const escaped = msg.text.substring(0, 100).replace(/\n/g, '\\n');
        console.log(`  Skipping message (type mismatch): ${escaped}...`);
        continue;
      }

      // Year validation
      if (!msg.text.includes(`_${year}]`)) {
        console.log(`  Skipping message (year mismatch): expected ${year}`);
        continue;
      }

      const parsed = this.parser.parseSummaryMessage(msg.text, msg.ts, year);
      if (parsed) {
        console.log(`  Parsed summary: ${parsed.dateRange.format()}`);
        summaries.push(parsed);
      } else {
        // Log why parsing failed - escape newlines for Cloud Logging
        const escaped = msg.text.substring(0, 300).replace(/\n/g, '\\n');
        console.log(`  Failed to parse message: ${escaped}`);
      }
    }

    console.log(`fetchSummariesFromThread: Returning ${summaries.length} summaries`);
    return summaries;
  }

  /**
   * Open a DM channel with a user (Bot to User)
   * Returns the channel ID that the bot can use to send messages
   */
  async openDMChannel(userId: string): Promise<string> {
    const response = await this.botClient.conversations.open({
      users: userId,
    });

    if (!response.ok || !response.channel?.id) {
      throw new SlackAPIError('conversations.open failed', response.error);
    }

    return response.channel.id;
  }

  /**
   * Open a self-DM channel (User's own DM with themselves)
   * Uses user token to open DM to self
   */
  async openSelfDMChannel(userId: string): Promise<string> {
    const response = await this.userClient.conversations.open({
      users: userId,
    });

    if (!response.ok || !response.channel?.id) {
      throw new SlackAPIError('conversations.open (self) failed', response.error);
    }

    return response.channel.id;
  }

  /**
   * Post a message to self-DM using user token
   * Returns the message ts
   */
  async postToSelfDM(params: { channelId: string; text: string; threadTs?: string }): Promise<string> {
    const { channelId, text, threadTs } = params;

    const response = await this.userClient.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
      mrkdwn: true,
    });

    if (!response.ok || !response.ts) {
      throw new SlackAPIError('chat.postMessage (self) failed', response.error);
    }

    return response.ts;
  }

  /**
   * Post a start message to create a new thread
   * Returns the message ts which can be used as thread_ts for subsequent replies
   */
  async postStartMessage(params: { channelId: string; text: string }): Promise<string> {
    const { channelId, text } = params;

    const response = await this.botClient.chat.postMessage({
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

    // Use userClient to post as the user (to self-DM)
    const response = await this.userClient.chat.postMessage({
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

    // Use userClient to post as the user
    const response = await this.userClient.chat.postMessage({
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
    const response = await this.userClient.users.info({ user: userId });

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
    let pageCount = 0;

    // Build channel types based on workspace configuration
    const types = this.buildChannelTypes();

    do {
      const response = await this.userClient.users.conversations({
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
      pageCount++;

      // Rate limit delay for pagination
      if (cursor) {
        await delay(RATE_LIMIT_DELAY_MS);
      }
    } while (cursor);

    const publicCount = channels.filter((ch) => !ch.isPrivate).length;
    const privateCount = channels.filter((ch) => ch.isPrivate).length;
    console.log(
      `Found ${channels.length} channels (public: ${publicCount}, private: ${privateCount}) in ${pageCount} page(s)`
    );
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
