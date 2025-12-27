import type { Post } from '../entities/Post';
import type { Summary } from '../entities/Summary';
import type { SummaryType } from '../value-objects/SummaryType';

/**
 * AI service interface for summary generation
 */
export interface IAIService {
  /**
   * Generate weekly summary from posts
   */
  generateWeeklySummary(posts: Post[]): Promise<GeneratedContent>;

  /**
   * Generate monthly summary from weekly summaries
   */
  generateMonthlySummary(weeklySummaries: Summary[]): Promise<GeneratedContent>;

  /**
   * Generate yearly summary from monthly summaries
   */
  generateYearlySummary(monthlySummaries: Summary[]): Promise<GeneratedContent>;
}

/**
 * AI generated content
 */
export interface GeneratedContent {
  content: string;
  metadata: ContentMetadata;
}

/**
 * Content metadata
 */
export interface ContentMetadata {
  tokensUsed: number;
  model: string;
  generatedAt: Date;
}

/**
 * AI generation schema (for Zod definition)
 */
export interface SummarySchema {
  type: SummaryType;
  highlights: string[];
  achievements: string[];
  challenges?: string[];
  summary: string;
}
