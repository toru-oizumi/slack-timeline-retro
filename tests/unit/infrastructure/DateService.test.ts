import { DateService } from '@/infrastructure/date/DateService';
import { describe, expect, it } from 'vitest';

describe('DateService', () => {
  const dateService = new DateService();

  describe('getWeekRange', () => {
    it('should get week range starting from Monday', () => {
      const date = new Date(2025, 0, 8); // Wednesday
      const range = dateService.getWeekRange(date);

      expect(range.start.getDay()).toBe(1); // Monday
      expect(range.end.getDay()).toBe(0); // Sunday
    });
  });

  describe('getWeeksOverlappingMonth', () => {
    it('should get all weeks overlapping with month', () => {
      const weeks = dateService.getWeeksOverlappingMonth(2025, 1);

      // January 2025 is 1/1 (Wed) - 1/31 (Fri)
      // With Monday start:
      // - 12/30 - 1/5 (includes January)
      // - 1/6 - 1/12
      // - 1/13 - 1/19
      // - 1/20 - 1/26
      // - 1/27 - 2/2 (includes January)
      expect(weeks.length).toBeGreaterThanOrEqual(4);

      // First week includes January
      expect(weeks[0].overlaps(dateService.getMonthRange(new Date(2025, 0, 1)))).toBe(true);
    });
  });

  describe('getWeekNumber', () => {
    it('should get ISO week number', () => {
      // January 6, 2025 is week 2
      const weekNum = dateService.getWeekNumber(new Date(2025, 0, 6));
      expect(weekNum).toBe(2);
    });
  });

  describe('getAllWeeksInYear', () => {
    it('should get all weeks in year', () => {
      const weeks = dateService.getAllWeeksInYear(2025);

      // A year has approximately 52-53 weeks
      expect(weeks.length).toBeGreaterThanOrEqual(52);
      expect(weeks.length).toBeLessThanOrEqual(53);

      // First week includes January
      const jan = dateService.getMonthRange(new Date(2025, 0, 1));
      expect(weeks[0].overlaps(jan)).toBe(true);
    });
  });

  describe('getAllMonthsInYear', () => {
    it('should get 12 months in year', () => {
      const months = dateService.getAllMonthsInYear(2025);

      expect(months.length).toBe(12);
      expect(months[0].start.getMonth()).toBe(0); // January
      expect(months[11].start.getMonth()).toBe(11); // December
    });
  });
});
