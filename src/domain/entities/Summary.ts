import { DateRange } from '../value-objects/DateRange';
import { getSummaryTag, SummaryType } from '../value-objects/SummaryType';

/**
 * Summary entity (aggregate root)
 */
export class Summary {
  private constructor(
    private readonly _id: string | null,
    private readonly _type: SummaryType,
    private readonly _content: string,
    private readonly _dateRange: DateRange,
    private readonly _year: number,
    private readonly _month?: number,
    private readonly _weekNumber?: number,
    private readonly _createdAt: Date = new Date()
  ) {
    Object.freeze(this);
  }

  get id(): string | null {
    return this._id;
  }

  get type(): SummaryType {
    return this._type;
  }

  get content(): string {
    return this._content;
  }

  get dateRange(): DateRange {
    return this._dateRange;
  }

  get year(): number {
    return this._year;
  }

  get month(): number | undefined {
    return this._month;
  }

  get weekNumber(): number | undefined {
    return this._weekNumber;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  /**
   * Create a weekly summary
   */
  static createWeekly(params: {
    content: string;
    dateRange: DateRange;
    year: number;
    weekNumber: number;
    id?: string;
  }): Summary {
    return new Summary(
      params.id ?? null,
      SummaryType.WEEKLY,
      params.content,
      params.dateRange,
      params.year,
      undefined,
      params.weekNumber
    );
  }

  /**
   * Create a monthly summary
   */
  static createMonthly(params: {
    content: string;
    dateRange: DateRange;
    year: number;
    month: number;
    id?: string;
  }): Summary {
    return new Summary(
      params.id ?? null,
      SummaryType.MONTHLY,
      params.content,
      params.dateRange,
      params.year,
      params.month
    );
  }

  /**
   * Create a yearly summary
   */
  static createYearly(params: {
    content: string;
    dateRange: DateRange;
    year: number;
    id?: string;
  }): Summary {
    return new Summary(
      params.id ?? null,
      SummaryType.YEARLY,
      params.content,
      params.dateRange,
      params.year
    );
  }

  /**
   * Restore a Summary from Slack message
   */
  static fromSlackMessage(params: {
    id: string;
    type: SummaryType;
    content: string;
    dateRange: DateRange;
    year: number;
    month?: number;
    weekNumber?: number;
  }): Summary {
    return new Summary(
      params.id,
      params.type,
      params.content,
      params.dateRange,
      params.year,
      params.month,
      params.weekNumber
    );
  }

  /**
   * Get formatted message for Slack posting
   * @param periodLabel - Label for the period line (default: '📅 Period:')
   */
  toSlackMessage(periodLabel = '📅 Period:'): string {
    const tag = getSummaryTag(this._type, this._year);
    const period = this._dateRange.format();

    return `${tag}\n${periodLabel} ${period}\n\n${this._content}`;
  }

  /**
   * Check if this summary overlaps with the given month (for monthly summary)
   */
  overlapsWithMonth(year: number, month: number): boolean {
    const monthRange = DateRange.forMonth(new Date(year, month - 1, 1));
    return this._dateRange.overlaps(monthRange);
  }

  /**
   * Check equality with another Summary
   */
  equals(other: Summary): boolean {
    if (this._id && other._id) {
      return this._id === other._id;
    }
    return this._type === other._type && this._dateRange.equals(other._dateRange);
  }

  toString(): string {
    return `Summary(${this._type}, ${this._dateRange.format()})`;
  }
}
