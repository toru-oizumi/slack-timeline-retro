import { describe, expect, it } from 'vitest';
import { Post } from '@/domain/entities/Post';

describe('Post', () => {
  describe('create', () => {
    it('should create a post', () => {
      const timestamp = new Date(2025, 0, 8, 10, 30, 0);
      const post = Post.create({
        id: '1736300000.000001',
        userId: 'U12345',
        text: 'テスト投稿です',
        timestamp,
        channelId: 'C12345',
      });

      expect(post.id).toBe('1736300000.000001');
      expect(post.userId).toBe('U12345');
      expect(post.text).toBe('テスト投稿です');
      expect(post.timestamp.getTime()).toBe(timestamp.getTime());
      expect(post.channelId).toBe('C12345');
      expect(post.threadTs).toBeUndefined();
    });

    it('should create a thread post', () => {
      const post = Post.create({
        id: '1736300000.000001',
        userId: 'U12345',
        text: 'スレッド返信',
        timestamp: new Date(),
        channelId: 'C12345',
        threadTs: '1736200000.000000',
      });

      expect(post.isInThread()).toBe(true);
      expect(post.threadTs).toBe('1736200000.000000');
    });
  });

  describe('fromSlackMessage', () => {
    it('should create post from Slack message', () => {
      const slackMessage = {
        ts: '1736300000.000001',
        user: 'U12345',
        text: 'テストメッセージ',
        channel: 'C12345',
      };

      const post = Post.fromSlackMessage(slackMessage);

      expect(post.id).toBe('1736300000.000001');
      expect(post.userId).toBe('U12345');
      expect(post.text).toBe('テストメッセージ');
    });
  });

  describe('toSummaryFormat', () => {
    it('should convert to summary format', () => {
      const post = Post.create({
        id: '1736300000.000001',
        userId: 'U12345',
        text: 'テスト投稿です',
        timestamp: new Date(2025, 0, 8, 10, 30, 0),
        channelId: 'C12345',
      });

      const formatted = post.toSummaryFormat();

      expect(formatted).toBe('[2025-01-08] テスト投稿です');
    });
  });

  describe('isInThread', () => {
    it('should return true for thread post', () => {
      const post = Post.create({
        id: '1',
        userId: 'U1',
        text: 'スレッド返信',
        timestamp: new Date(),
        channelId: 'C1',
        threadTs: '12345',
      });

      expect(post.isInThread()).toBe(true);
    });

    it('should return false for regular post', () => {
      const post = Post.create({
        id: '1',
        userId: 'U1',
        text: '通常投稿',
        timestamp: new Date(),
        channelId: 'C1',
      });

      expect(post.isInThread()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for posts with same ID', () => {
      const post1 = Post.create({
        id: '12345',
        userId: 'U1',
        text: 'テスト1',
        timestamp: new Date(),
        channelId: 'C1',
      });
      const post2 = Post.create({
        id: '12345',
        userId: 'U2', // Different user
        text: 'テスト2', // Different text
        timestamp: new Date(),
        channelId: 'C2',
      });

      expect(post1.equals(post2)).toBe(true);
    });
  });
});
