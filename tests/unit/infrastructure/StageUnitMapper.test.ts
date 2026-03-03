import { describe, expect, it, vi } from 'vitest';
import { DateRange } from '@/domain';
import { DateService } from '@/infrastructure/date/DateService';
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
});
