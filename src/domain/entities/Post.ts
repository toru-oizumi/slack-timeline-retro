/**
 * Entity representing a Slack post
 */
export class Post {
  private constructor(
    private readonly _id: string,
    private readonly _userId: string,
    private readonly _text: string,
    private readonly _timestamp: Date,
    private readonly _channelId: string,
    private readonly _threadTs?: string
  ) {
    Object.freeze(this);
  }

  get id(): string {
    return this._id;
  }

  get userId(): string {
    return this._userId;
  }

  get text(): string {
    return this._text;
  }

  get timestamp(): Date {
    return new Date(this._timestamp);
  }

  get channelId(): string {
    return this._channelId;
  }

  get threadTs(): string | undefined {
    return this._threadTs;
  }

  /**
   * Create a Post from Slack API message response
   */
  static fromSlackMessage(message: SlackMessage): Post {
    const timestamp = new Date(Number.parseFloat(message.ts) * 1000);
    return new Post(
      message.ts,
      message.user,
      message.text,
      timestamp,
      message.channel ?? '',
      message.thread_ts
    );
  }

  /**
   * Create a Post manually (for testing)
   */
  static create(params: {
    id: string;
    userId: string;
    text: string;
    timestamp: Date;
    channelId: string;
    threadTs?: string;
  }): Post {
    return new Post(
      params.id,
      params.userId,
      params.text,
      params.timestamp,
      params.channelId,
      params.threadTs
    );
  }

  /**
   * Check if this post is in a thread
   */
  isInThread(): boolean {
    return this._threadTs !== undefined;
  }

  /**
   * Convert to summary format for AI processing
   */
  toSummaryFormat(): string {
    const dateStr = this._timestamp.toISOString().split('T')[0];
    return `[${dateStr}] ${this._text}`;
  }

  /**
   * Check equality with another Post
   */
  equals(other: Post): boolean {
    return this._id === other._id;
  }
}

/**
 * Slack API message type
 */
export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  channel?: string;
  thread_ts?: string;
}
