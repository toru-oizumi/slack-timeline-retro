import { SummaryType, getSummaryTag, parseSummaryType } from '@/domain/value-objects/SummaryType';
import { describe, expect, it } from 'vitest';

describe('SummaryType', () => {
  describe('getSummaryTag', () => {
    it('should get weekly summary tag', () => {
      expect(getSummaryTag(SummaryType.WEEKLY, 2025)).toBe('[WeeklySummary_2025]');
    });

    it('should get monthly summary tag', () => {
      expect(getSummaryTag(SummaryType.MONTHLY, 2025)).toBe('[MonthlySummary_2025]');
    });

    it('should get yearly summary tag', () => {
      expect(getSummaryTag(SummaryType.YEARLY, 2025)).toBe('[YearlySummary_2025]');
    });
  });

  describe('parseSummaryType', () => {
    it('should parse weekly summary tag', () => {
      const message = '[WeeklySummary_2025] 今週のハイライト...';
      expect(parseSummaryType(message)).toBe(SummaryType.WEEKLY);
    });

    it('should parse monthly summary tag', () => {
      const message = '[MonthlySummary_2025] 今月のハイライト...';
      expect(parseSummaryType(message)).toBe(SummaryType.MONTHLY);
    });

    it('should parse yearly summary tag', () => {
      const message = '[YearlySummary_2025] 今年のハイライト...';
      expect(parseSummaryType(message)).toBe(SummaryType.YEARLY);
    });

    it('should return null when tag is not found', () => {
      const message = '普通のメッセージです';
      expect(parseSummaryType(message)).toBeNull();
    });
  });
});
