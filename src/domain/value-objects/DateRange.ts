import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isBefore,
  isValid,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

/**
 * Immutable value object representing a date range
 * Provides date range operations and validation
 */
export class DateRange {
  private constructor(
    private readonly _start: Date,
    private readonly _end: Date
  ) {
    Object.freeze(this);
  }

  get start(): Date {
    return new Date(this._start);
  }

  get end(): Date {
    return new Date(this._end);
  }

  /**
   * Create a date range from start and end dates
   */
  static create(start: Date, end: Date): DateRange {
    if (!isValid(start) || !isValid(end)) {
      throw new InvalidDateRangeError('Invalid date provided');
    }
    if (isAfter(start, end)) {
      throw new InvalidDateRangeError('Start date must be before end date');
    }
    return new DateRange(start, end);
  }

  /**
   * Create a week range containing the given date (Monday start)
   */
  static forWeek(date: Date): DateRange {
    if (!isValid(date)) {
      throw new InvalidDateRangeError('Invalid date provided');
    }
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return new DateRange(start, end);
  }

  /**
   * Create a month range containing the given date
   */
  static forMonth(date: Date): DateRange {
    if (!isValid(date)) {
      throw new InvalidDateRangeError('Invalid date provided');
    }
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return new DateRange(start, end);
  }

  /**
   * Create a year range for the given year
   */
  static forYear(year: number): DateRange {
    const date = new Date(year, 0, 1);
    if (!isValid(date)) {
      throw new InvalidDateRangeError('Invalid year provided');
    }
    const start = startOfYear(date);
    const end = endOfYear(date);
    return new DateRange(start, end);
  }

  /**
   * Check if the given date is within this range
   */
  contains(date: Date): boolean {
    return isWithinInterval(date, { start: this._start, end: this._end });
  }

  /**
   * Check if this range overlaps with another range
   */
  overlaps(other: DateRange): boolean {
    return !(isAfter(this._start, other._end) || isBefore(this._end, other._start));
  }

  /**
   * Format the range as a string
   */
  format(dateFormat = 'yyyy/MM/dd'): string {
    return `${format(this._start, dateFormat)} 〜 ${format(this._end, dateFormat)}`;
  }

  /**
   * Check equality with another DateRange
   */
  equals(other: DateRange): boolean {
    return (
      this._start.getTime() === other._start.getTime() &&
      this._end.getTime() === other._end.getTime()
    );
  }

  toString(): string {
    return this.format();
  }
}

/**
 * Error thrown when an invalid date range is provided
 */
export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDateRangeError';
  }
}
