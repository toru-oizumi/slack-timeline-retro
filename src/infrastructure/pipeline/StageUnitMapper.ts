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
    }
  }
}
