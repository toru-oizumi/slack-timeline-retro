/**
 * Value object representing summary types
 */
export const SummaryType = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export type SummaryType = (typeof SummaryType)[keyof typeof SummaryType];

/**
 * Get Slack tag for the given summary type
 */
export function getSummaryTag(type: SummaryType, year: number): string {
  switch (type) {
    case SummaryType.WEEKLY:
      return `[WeeklySummary_${year}]`;
    case SummaryType.MONTHLY:
      return `[MonthlySummary_${year}]`;
    case SummaryType.YEARLY:
      return `[YearlySummary_${year}]`;
  }
}

/**
 * Parse summary type from Slack message
 */
export function parseSummaryType(message: string): SummaryType | null {
  if (message.includes('[WeeklySummary_')) return SummaryType.WEEKLY;
  if (message.includes('[MonthlySummary_')) return SummaryType.MONTHLY;
  if (message.includes('[YearlySummary_')) return SummaryType.YEARLY;
  return null;
}
