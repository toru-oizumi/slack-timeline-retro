import { describe, expect, it, vi } from 'vitest';
import { DateRange } from '@/domain';
import type { DateService } from '@/infrastructure/date/DateService';
import { StageUnitMapper } from '@/infrastructure/pipeline/StageUnitMapper';

describe('StageUnitMapper', () => {
  const makeRange = (year: number, month: number, startDay: number, endDay: number) =>
    DateRange.create(new Date(year, month - 1, startDay), new Date(year, month - 1, endDay));

  describe('getRangesForYear', () => {
    it('delegates to getAllWeeksInYear for unit=week', () => {
      const mockRanges = [makeRange(2025, 1, 1, 7), makeRange(2025, 1, 8, 14)];
      const dateService = { getAllWeeksInYear: vi.fn(() => mockRanges) } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForYear('week', 2025);

      expect(dateService.getAllWeeksInYear).toHaveBeenCalledWith(2025);
      expect(result).toBe(mockRanges);
    });

    it('delegates to getAllMonthsInYear for unit=month', () => {
      const mockRanges = [makeRange(2025, 1, 1, 31), makeRange(2025, 2, 1, 28)];
      const dateService = {
        getAllMonthsInYear: vi.fn(() => mockRanges),
      } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForYear('month', 2025);

      expect(dateService.getAllMonthsInYear).toHaveBeenCalledWith(2025);
      expect(result).toBe(mockRanges);
    });

    it('returns a single full-year range for unit=year', () => {
      const yearRange = makeRange(2025, 1, 1, 31); // simplified
      const dateService = { getYearRange: vi.fn(() => yearRange) } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForYear('year', 2025);

      expect(dateService.getYearRange).toHaveBeenCalledWith(2025);
      expect(result).toEqual([yearRange]);
    });

    it('throws for unit=day', () => {
      const mapper = new StageUnitMapper({} as DateService);

      expect(() => mapper.getRangesForYear('day', 2025)).toThrow(
        `StageUnit "day" is not yet supported`
      );
    });

    it('throws for unit=quarter', () => {
      const mapper = new StageUnitMapper({} as DateService);

      expect(() => mapper.getRangesForYear('quarter', 2025)).toThrow(
        `StageUnit "quarter" is not yet supported`
      );
    });
  });

  describe('getRangesForPeriod', () => {
    it('delegates to getWeeksInPeriod for unit=week', () => {
      const mockRanges = [makeRange(2025, 9, 1, 7)];
      const dateService = { getWeeksInPeriod: vi.fn(() => mockRanges) } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForPeriod('week', '2025-09', '2026-02');

      expect(dateService.getWeeksInPeriod).toHaveBeenCalledWith('2025-09', '2026-02');
      expect(result).toBe(mockRanges);
    });

    it('delegates to getMonthsInPeriod for unit=month', () => {
      const mockRanges = [makeRange(2025, 9, 1, 30)];
      const dateService = { getMonthsInPeriod: vi.fn(() => mockRanges) } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForPeriod('month', '2025-09', '2026-02');

      expect(dateService.getMonthsInPeriod).toHaveBeenCalledWith('2025-09', '2026-02');
      expect(result).toBe(mockRanges);
    });

    it('returns one range per year for unit=year', () => {
      const yearRange2025 = makeRange(2025, 1, 1, 31);
      const yearRange2026 = makeRange(2026, 1, 1, 31);
      const dateService = {
        getYearRange: vi.fn((y: number) => (y === 2025 ? yearRange2025 : yearRange2026)),
      } as unknown as DateService;
      const mapper = new StageUnitMapper(dateService);

      const result = mapper.getRangesForPeriod('year', '2025-09', '2026-02');

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(yearRange2025);
      expect(result[1]).toBe(yearRange2026);
    });

    it('throws for unit=all_years', () => {
      const mapper = new StageUnitMapper({} as DateService);
      expect(() => mapper.getRangesForPeriod('all_years', '2025-09', '2026-02')).toThrow();
    });
  });
});
