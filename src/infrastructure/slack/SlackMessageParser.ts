import { DateRange, parseSummaryType, Summary, SummaryType } from '@/domain';

/**
 * Slack message parser
 */
export class SlackMessageParser {
  /**
   * Parse a summary message and create a Summary entity
   */
  parseSummaryMessage(text: string, messageId: string, expectedYear: number): Summary | null {
    const type = parseSummaryType(text);
    if (!type) return null;

    // Extract period information
    // Supports:
    // - English: "📅 Period:", ":calendar: Period:", ":date: Period:"
    // - Japanese: "📅 期間:", ":日付: 期間:", ":calendar: 期間:", ":date: 期間:"
    // Note: Slack converts emoji to shortcode (e.g., 📅 → :date:)
    const periodMatch = text.match(
      /(?:📅|:日付:|:calendar:|:date:)\s*(?:Period|期間):\s*(\d{4}\/\d{2}\/\d{2})\s*[〜~-]\s*(\d{4}\/\d{2}\/\d{2})/
    );
    if (!periodMatch) {
      // Log for debugging - show what pattern we're looking for in the text
      const snippet = text.substring(0, 150).replace(/\n/g, '\\n');
      console.log(`parseSummaryMessage: Period regex failed. Text snippet: "${snippet}"`);
      return null;
    }

    const startDate = this.parseDate(periodMatch[1]);
    const endDate = this.parseDate(periodMatch[2]);
    if (!startDate || !endDate) return null;

    const dateRange = DateRange.create(startDate, endDate);

    // Extract content (remove header and period info)
    const content = this.extractContent(text);

    switch (type) {
      case SummaryType.WEEKLY: {
        const weekNumber = this.extractWeekNumber(startDate);
        return Summary.fromSlackMessage({
          id: messageId,
          type,
          content,
          dateRange,
          year: expectedYear,
          weekNumber,
        });
      }
      case SummaryType.MONTHLY: {
        const month = startDate.getMonth() + 1;
        return Summary.fromSlackMessage({
          id: messageId,
          type,
          content,
          dateRange,
          year: expectedYear,
          month,
        });
      }
      case SummaryType.YEARLY: {
        return Summary.fromSlackMessage({
          id: messageId,
          type,
          content,
          dateRange,
          year: expectedYear,
        });
      }
    }
  }

  private parseDate(dateStr: string): Date | null {
    const [year, month, day] = dateStr.split('/').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  private extractContent(text: string): string {
    // Remove tag line and period line, extract content
    const lines = text.split('\n');
    const contentLines: string[] = [];
    let startContent = false;

    for (const line of lines) {
      // Skip header section (supports both English and Japanese period labels)
      // Also handle Slack emoji shortcodes (:日付:, :calendar:, :date:)
      if (
        line.includes('[WeeklySummary_') ||
        line.includes('[MonthlySummary_') ||
        line.includes('[YearlySummary_') ||
        line.includes('📅 Period:') ||
        line.includes('📅 期間:') ||
        line.includes(':日付: 期間:') ||
        line.includes(':calendar: Period:') ||
        line.includes(':calendar: 期間:') ||
        line.includes(':date: Period:') ||
        line.includes(':date: 期間:')
      ) {
        continue;
      }

      if (line.trim() === '' && !startContent) {
        continue;
      }

      startContent = true;
      contentLines.push(line);
    }

    return contentLines.join('\n').trim();
  }

  private extractWeekNumber(date: Date): number {
    // Calculate ISO week number
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }
}
