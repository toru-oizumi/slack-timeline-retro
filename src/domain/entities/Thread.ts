import type { Post } from './Post';

/**
 * Entity representing a Slack thread (parent message + replies)
 */
export class Thread {
  private constructor(
    private readonly _id: string, // parent message ts
    private readonly _channelId: string,
    private readonly _parentText: string,
    private readonly _replies: Post[],
    private readonly _replyCount: number,
    private readonly _reactionCount: number,
    private readonly _timestamp: Date
  ) {
    Object.freeze(this);
  }

  get id(): string {
    return this._id;
  }

  get channelId(): string {
    return this._channelId;
  }

  get parentText(): string {
    return this._parentText;
  }

  get replies(): Post[] {
    return [...this._replies];
  }

  get replyCount(): number {
    return this._replyCount;
  }

  get reactionCount(): number {
    return this._reactionCount;
  }

  get timestamp(): Date {
    return new Date(this._timestamp);
  }

  /**
   * Composite score for top_engaged sampling strategy
   */
  get engagementScore(): number {
    return this._reactionCount + this._replyCount;
  }

  static create(params: {
    id: string;
    channelId: string;
    parentText: string;
    replies: Post[];
    replyCount: number;
    reactionCount: number;
    timestamp: Date;
  }): Thread {
    return new Thread(
      params.id,
      params.channelId,
      params.parentText,
      params.replies,
      params.replyCount,
      params.reactionCount,
      params.timestamp
    );
  }

  /**
   * Format thread content for AI processing
   */
  toSummaryFormat(): string {
    const dateStr = this._timestamp.toISOString().split('T')[0];
    const header = `[${dateStr}] ${this._parentText}`;
    if (this._replies.length === 0) {
      return header;
    }
    const repliesText = this._replies.map((r) => `  > ${r.text}`).join('\n');
    return `${header}\n${repliesText}`;
  }
}
