import { describe, expect, it } from 'vitest';
import { DateRange, InvalidDateRangeError } from '@/domain/value-objects/DateRange';

describe('DateRange', () => {
  describe('create', () => {
    it('should create a valid date range', () => {
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 0, 7);
      const range = DateRange.create(start, end);

      expect(range.start.getTime()).toBe(start.getTime());
      expect(range.end.getTime()).toBe(end.getTime());
    });

    it('should throw error when start date is after end date', () => {
      const start = new Date(2025, 0, 7);
      const end = new Date(2025, 0, 1);

      expect(() => DateRange.create(start, end)).toThrow(InvalidDateRangeError);
    });

    it('should throw error for invalid dates', () => {
      const start = new Date('invalid');
      const end = new Date(2025, 0, 7);

      expect(() => DateRange.create(start, end)).toThrow(InvalidDateRangeError);
    });
  });

  describe('forWeek', () => {
    it('should get week range starting from Monday', () => {
      // January 8, 2025 (Wednesday)
      const date = new Date(2025, 0, 8);
      const range = DateRange.forWeek(date);

      // Monday (January 6) is the start date
      expect(range.start.getDate()).toBe(6);
      expect(range.start.getDay()).toBe(1); // Monday

      // Sunday (January 12) is the end date
      expect(range.end.getDate()).toBe(12);
      expect(range.end.getDay()).toBe(0); // Sunday
    });
  });

  describe('forMonth', () => {
    it('should get month range', () => {
      const date = new Date(2025, 0, 15);
      const range = DateRange.forMonth(date);

      expect(range.start.getMonth()).toBe(0);
      expect(range.start.getDate()).toBe(1);
      expect(range.end.getMonth()).toBe(0);
      expect(range.end.getDate()).toBe(31);
    });
  });

  describe('forYear', () => {
    it('should get year range', () => {
      const range = DateRange.forYear(2025);

      expect(range.start.getFullYear()).toBe(2025);
      expect(range.start.getMonth()).toBe(0);
      expect(range.start.getDate()).toBe(1);

      expect(range.end.getFullYear()).toBe(2025);
      expect(range.end.getMonth()).toBe(11);
      expect(range.end.getDate()).toBe(31);
    });
  });

  describe('contains', () => {
    it('should return true for date within range', () => {
      const range = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 31));

      expect(range.contains(new Date(2025, 0, 15))).toBe(true);
    });

    it('should return false for date outside range', () => {
      const range = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 31));

      expect(range.contains(new Date(2025, 1, 1))).toBe(false);
    });
  });

  describe('overlaps', () => {
    it('should return true for overlapping ranges', () => {
      const range1 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 15));
      const range2 = DateRange.create(new Date(2025, 0, 10), new Date(2025, 0, 20));

      expect(range1.overlaps(range2)).toBe(true);
    });

    it('should return false for non-overlapping ranges', () => {
      const range1 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 10));
      const range2 = DateRange.create(new Date(2025, 0, 15), new Date(2025, 0, 20));

      expect(range1.overlaps(range2)).toBe(false);
    });
  });

  describe('format', () => {
    it('should output in default format', () => {
      const range = DateRange.create(new Date(2025, 0, 6), new Date(2025, 0, 12));

      expect(range.format()).toBe('2025/01/06 〜 2025/01/12');
    });
  });

  describe('equals', () => {
    it('should return true for same ranges', () => {
      const range1 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 7));
      const range2 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 7));

      expect(range1.equals(range2)).toBe(true);
    });

    it('should return false for different ranges', () => {
      const range1 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 7));
      const range2 = DateRange.create(new Date(2025, 0, 1), new Date(2025, 0, 8));

      expect(range1.equals(range2)).toBe(false);
    });
  });
});
