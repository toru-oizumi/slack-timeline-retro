/**
 * Value object representing Slack channel information
 */
export class SlackChannel {
  private constructor(
    private readonly _channelId: string,
    private readonly _threadTs?: string
  ) {
    Object.freeze(this);
  }

  get channelId(): string {
    return this._channelId;
  }

  get threadTs(): string | undefined {
    return this._threadTs;
  }

  /**
   * Create a SlackChannel from channel ID
   */
  static create(channelId: string, threadTs?: string): SlackChannel {
    if (!channelId || channelId.trim() === '') {
      throw new InvalidSlackChannelError('Channel ID is required');
    }
    return new SlackChannel(channelId, threadTs);
  }

  /**
   * Create a SlackChannel for DM with thread
   */
  static createDM(channelId: string, threadTs: string): SlackChannel {
    if (!threadTs || threadTs.trim() === '') {
      throw new InvalidSlackChannelError('thread_ts is required for DM threads');
    }
    return new SlackChannel(channelId, threadTs);
  }

  /**
   * Check if this is a thread reply
   */
  isThreadReply(): boolean {
    return this._threadTs !== undefined;
  }

  /**
   * Check equality with another SlackChannel
   */
  equals(other: SlackChannel): boolean {
    return this._channelId === other._channelId && this._threadTs === other._threadTs;
  }

  toString(): string {
    return this._threadTs ? `${this._channelId}:${this._threadTs}` : this._channelId;
  }
}

/**
 * Error thrown when an invalid Slack channel is provided
 */
export class InvalidSlackChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSlackChannelError';
  }
}
