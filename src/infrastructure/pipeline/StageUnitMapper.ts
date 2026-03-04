import type { DateRange } from '@/domain';
import type { DateService } from '../date/DateService';
import type { StageUnit } from './types';

/**
 * Maps a StageUnit to the corresponding DateService method,
 * returning the list of date ranges for a given year.
 *
 * StageUnit を DateService のメソッドに対応させ、
 * 指定した年の日付範囲リストを返す。
 */
export class StageUnitMapper {
  constructor(private readonly dateService: DateService) {}

  /**
   * Return the atomic date ranges for the given unit within the specified period.
   * - week  → all weeks overlapping the period
   * - month → all calendar months in the period
   * - year  → one range per calendar year covered by the period
   * @param unit  - Stage unit (week | month | year)
   * @param start - First month inclusive, format "YYYY-MM"
   * @param end   - Last month inclusive, format "YYYY-MM"
   */
  getRangesForPeriod(unit: StageUnit, start: string, end: string): DateRange[] {
    switch (unit) {
      case 'week':
        return this.dateService.getWeeksInPeriod(start, end);
      case 'month':
        return this.dateService.getMonthsInPeriod(start, end);
      case 'year': {
        const startYear = Number.parseInt(start.split('-')[0], 10);
        const endYear = Number.parseInt(end.split('-')[0], 10);
        const ranges: DateRange[] = [];
        for (let y = startYear; y <= endYear; y++) {
          ranges.push(this.dateService.getYearRange(y));
        }
        return ranges;
      }
      case 'day':
      case 'quarter':
        throw new Error(`StageUnit "${unit}" is not yet supported for period ranges`);
      case 'all_years':
        throw new Error(`StageUnit "all_years" cannot be mapped to date ranges`);
    }
  }

  /**
   * Return the atomic date ranges for the given unit and year.
   * - week  → all ISO weeks in the year
   * - month → all 12 calendar months
   * - year  → single range covering the full year
   */
  getRangesForYear(unit: StageUnit, year: number): DateRange[] {
    switch (unit) {
      case 'week':
        return this.dateService.getAllWeeksInYear(year);
      case 'month':
        return this.dateService.getAllMonthsInYear(year);
      case 'year':
        return [this.dateService.getYearRange(year)];
      case 'day':
      case 'quarter':
        throw new Error(`StageUnit "${unit}" is not yet supported`);
      case 'all_years':
        // all_years is a cross-year aggregation stage handled by the posting worker, not by date ranges
        throw new Error(`StageUnit "all_years" cannot be mapped to date ranges`);
    }
  }
}
