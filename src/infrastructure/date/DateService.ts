import { DateRange } from '@/domain';
import {
  addMonths,
  addWeeks,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  getMonth,
  getWeek,
  getYear,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

/**
 * Date operation service
 */
export class DateService {
  /**
   * Get the week range containing the specified date (Monday start)
   */
  getWeekRange(date: Date): DateRange {
    return DateRange.forWeek(date);
  }

  /**
   * Get the month range containing the specified date
   */
  getMonthRange(date: Date): DateRange {
    return DateRange.forMonth(date);
  }

  /**
   * Get the year range
   */
  getYearRange(year: number): DateRange {
    return DateRange.forYear(year);
  }

  /**
   * Get all weeks overlapping with the specified month
   *
   * Returns weeks from the one containing month start to the one containing month end
   */
  getWeeksOverlappingMonth(year: number, month: number): DateRange[] {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfMonth(monthStart);

    const weeks: DateRange[] = [];
    const weekStarts = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1 }
    );

    for (const weekStart of weekStarts) {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      weeks.push(DateRange.create(weekStart, weekEnd));
    }

    return weeks;
  }

  /**
   * Get ISO week number
   */
  getWeekNumber(date: Date): number {
    return getWeek(date, { weekStartsOn: 1 });
  }

  /**
   * Get month (1-12)
   */
  getMonth(date: Date): number {
    return getMonth(date) + 1;
  }

  /**
   * Get year
   */
  getYear(date: Date): number {
    return getYear(date);
  }

  /**
   * Get all weeks in the specified year
   */
  getAllWeeksInYear(year: number): DateRange[] {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const weeks: DateRange[] = [];
    let currentWeekStart = startOfWeek(yearStart, { weekStartsOn: 1 });

    // Start from next week if the week containing Jan 1 belongs to previous year
    if (getYear(currentWeekStart) < year) {
      currentWeekStart = addWeeks(currentWeekStart, 1);
    }

    while (currentWeekStart <= yearEnd) {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      weeks.push(DateRange.create(currentWeekStart, weekEnd));
      currentWeekStart = addWeeks(currentWeekStart, 1);
    }

    return weeks;
  }

  /**
   * Get all months in the specified year
   */
  getAllMonthsInYear(year: number): DateRange[] {
    const months: DateRange[] = [];

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(year, month, 1);
      const monthEnd = endOfMonth(monthStart);
      months.push(DateRange.create(monthStart, monthEnd));
    }

    return months;
  }
}
