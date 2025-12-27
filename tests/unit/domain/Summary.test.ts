import { Summary } from '@/domain/entities/Summary';
import { DateRange } from '@/domain/value-objects/DateRange';
import { SummaryType } from '@/domain/value-objects/SummaryType';
import { describe, expect, it } from 'vitest';

describe('Summary', () => {
  describe('createWeekly', () => {
    it('should create a weekly summary', () => {
      const dateRange = DateRange.forWeek(new Date(2025, 0, 8));
      const summary = Summary.createWeekly({
        content: 'テストコンテンツ',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      expect(summary.type).toBe(SummaryType.WEEKLY);
      expect(summary.content).toBe('テストコンテンツ');
      expect(summary.year).toBe(2025);
      expect(summary.weekNumber).toBe(2);
      expect(summary.id).toBeNull();
    });

    it('should create with specified ID', () => {
      const dateRange = DateRange.forWeek(new Date(2025, 0, 8));
      const summary = Summary.createWeekly({
        id: '12345.67890',
        content: 'テストコンテンツ',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      expect(summary.id).toBe('12345.67890');
    });
  });

  describe('createMonthly', () => {
    it('should create a monthly summary', () => {
      const dateRange = DateRange.forMonth(new Date(2025, 0, 1));
      const summary = Summary.createMonthly({
        content: '1月のサマリー',
        dateRange,
        year: 2025,
        month: 1,
      });

      expect(summary.type).toBe(SummaryType.MONTHLY);
      expect(summary.month).toBe(1);
    });
  });

  describe('createYearly', () => {
    it('should create a yearly summary', () => {
      const dateRange = DateRange.forYear(2025);
      const summary = Summary.createYearly({
        content: '2025年のサマリー',
        dateRange,
        year: 2025,
      });

      expect(summary.type).toBe(SummaryType.YEARLY);
    });
  });

  describe('toSlackMessage', () => {
    it('should generate Slack message with default English period label', () => {
      const dateRange = DateRange.create(new Date(2025, 0, 6), new Date(2025, 0, 12));
      const summary = Summary.createWeekly({
        content: '## Highlights\n- Item 1',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      const message = summary.toSlackMessage();

      expect(message).toContain('[WeeklySummary_2025]');
      expect(message).toContain('📅 Period: 2025/01/06 〜 2025/01/12');
      expect(message).toContain('## Highlights');
    });

    it('should generate Slack message with Japanese period label', () => {
      const dateRange = DateRange.create(new Date(2025, 0, 6), new Date(2025, 0, 12));
      const summary = Summary.createWeekly({
        content: '## ハイライト\n- 項目1',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      const message = summary.toSlackMessage('📅 期間:');

      expect(message).toContain('[WeeklySummary_2025]');
      expect(message).toContain('📅 期間: 2025/01/06 〜 2025/01/12');
      expect(message).toContain('## ハイライト');
    });
  });

  describe('overlapsWithMonth', () => {
    it('should return true for week overlapping with month', () => {
      // Week of 1/27 - 2/2
      const dateRange = DateRange.create(new Date(2025, 0, 27), new Date(2025, 1, 2));
      const summary = Summary.createWeekly({
        content: 'テスト',
        dateRange,
        year: 2025,
        weekNumber: 5,
      });

      // Overlaps with January
      expect(summary.overlapsWithMonth(2025, 1)).toBe(true);
      // Overlaps with February
      expect(summary.overlapsWithMonth(2025, 2)).toBe(true);
      // Does not overlap with March
      expect(summary.overlapsWithMonth(2025, 3)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for summaries with same ID', () => {
      const dateRange = DateRange.forWeek(new Date(2025, 0, 8));
      const summary1 = Summary.createWeekly({
        id: '12345',
        content: 'コンテンツ1',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });
      const summary2 = Summary.createWeekly({
        id: '12345',
        content: 'コンテンツ2', // Different content
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      expect(summary1.equals(summary2)).toBe(true);
    });

    it('should compare by type+dateRange when ID is null', () => {
      const dateRange = DateRange.forWeek(new Date(2025, 0, 8));
      const summary1 = Summary.createWeekly({
        content: 'コンテンツ1',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });
      const summary2 = Summary.createWeekly({
        content: 'コンテンツ2',
        dateRange,
        year: 2025,
        weekNumber: 2,
      });

      expect(summary1.equals(summary2)).toBe(true);
    });
  });
});
