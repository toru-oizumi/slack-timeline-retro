import { describe, expect, it } from 'vitest';
import { SummaryType } from '@/domain';
import { SlackMessageParser } from '@/infrastructure/slack/SlackMessageParser';

describe('SlackMessageParser', () => {
  const parser = new SlackMessageParser();

  describe('parseSummaryMessage', () => {
    it('should parse weekly summary message', () => {
      const message = `[WeeklySummary_2025]
📅 期間: 2025/01/06 〜 2025/01/12

## 今週のハイライト
- 項目1
- 項目2`;

      const summary = parser.parseSummaryMessage(message, '12345.67890', 2025);

      expect(summary).not.toBeNull();
      expect(summary?.type).toBe(SummaryType.WEEKLY);
      expect(summary?.id).toBe('12345.67890');
      expect(summary?.dateRange.start.getDate()).toBe(6);
      expect(summary?.dateRange.end.getDate()).toBe(12);
    });

    it('should parse monthly summary message', () => {
      const message = `[MonthlySummary_2025]
📅 期間: 2025/01/01 〜 2025/01/31

## 1月のハイライト
- 成果1`;

      const summary = parser.parseSummaryMessage(message, '12345.67890', 2025);

      expect(summary).not.toBeNull();
      expect(summary?.type).toBe(SummaryType.MONTHLY);
      expect(summary?.month).toBe(1);
    });

    it('should parse yearly summary message', () => {
      const message = `[YearlySummary_2025]
📅 期間: 2025/01/01 〜 2025/12/31

## 2025年のハイライト
- 年間成果`;

      const summary = parser.parseSummaryMessage(message, '12345.67890', 2025);

      expect(summary).not.toBeNull();
      expect(summary?.type).toBe(SummaryType.YEARLY);
    });

    it('should parse message with English period label', () => {
      const message = `[WeeklySummary_2025]
📅 Period: 2025/01/06 〜 2025/01/12

## This Week's Highlights
- Item 1
- Item 2`;

      const summary = parser.parseSummaryMessage(message, '12345.67890', 2025);

      expect(summary).not.toBeNull();
      expect(summary?.type).toBe(SummaryType.WEEKLY);
      expect(summary?.dateRange.start.getDate()).toBe(6);
      expect(summary?.content).toContain("## This Week's Highlights");
      expect(summary?.content).not.toContain('📅 Period:');
    });

    it('should return null for message without tag', () => {
      const message = 'Regular message';
      const summary = parser.parseSummaryMessage(message, '12345', 2025);

      expect(summary).toBeNull();
    });

    it('should return null for message without date range', () => {
      const message = `[WeeklySummary_2025]
## 今週のハイライト
- 項目1`;

      const summary = parser.parseSummaryMessage(message, '12345', 2025);

      expect(summary).toBeNull();
    });

    it('should correctly extract content portion', () => {
      const message = `[WeeklySummary_2025]
📅 期間: 2025/01/06 〜 2025/01/12

## 今週のハイライト
- 項目1
- 項目2

## カテゴリ別
### 開発
- 機能実装`;

      const summary = parser.parseSummaryMessage(message, '12345', 2025);

      expect(summary).not.toBeNull();
      expect(summary?.content).toContain('## 今週のハイライト');
      expect(summary?.content).not.toContain('[WeeklySummary_2025]');
      expect(summary?.content).not.toContain('📅 期間:');
    });
  });
});
