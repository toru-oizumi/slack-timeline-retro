/**
 * Pub/Sub message types for summary job processing
 */

/**
 * Summary type options
 */
export type SummaryType = 'weekly' | 'monthly' | 'yearly';

/**
 * Job status
 */
export type JobStatus = 'pending' | 'processing' | 'posting' | 'completed' | 'error';

/**
 * Week task status
 */
export type WeekTaskStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * Summary options from slash command
 */
export interface SummaryOptions {
  includePrivate: boolean;
  includeDM: boolean;
  includeGroup: boolean;
}

/**
 * Message sent to summary-jobs topic
 * Contains only jobId - full details fetched from Firestore
 */
export interface SummaryJobMessage {
  jobId: string;
}

/**
 * Message sent to weekly-tasks topic
 * For parallel week processing in yearly summaries
 */
export interface WeekTaskMessage {
  jobId: string;
  weekNumber: number;
  year: number;
  dateRange: {
    start: string; // ISO date string
    end: string; // ISO date string
  };
}

/**
 * Message sent to posting-tasks topic
 * Triggered when all week tasks complete
 */
export interface PostingTaskMessage {
  jobId: string;
}

/**
 * Pub/Sub topic names
 */
export const PUBSUB_TOPICS = {
  SUMMARY_JOBS: 'summary-jobs',
  WEEKLY_TASKS: 'weekly-tasks',
  POSTING_TASKS: 'posting-tasks',
  DEAD_LETTER: 'summary-dlq',
} as const;

/**
 * Pub/Sub subscription names
 */
export const PUBSUB_SUBSCRIPTIONS = {
  SUMMARY_JOBS_PUSH: 'summary-jobs-push',
  WEEKLY_TASKS_PUSH: 'weekly-tasks-push',
  POSTING_TASKS_PUSH: 'posting-tasks-push',
} as const;

/**
 * Cloud Run endpoint paths for Pub/Sub push subscriptions
 */
export const PUBSUB_ENDPOINTS = {
  ORCHESTRATE: '/pubsub/orchestrate',
  WEEK_WORKER: '/pubsub/week-worker',
  POSTING: '/pubsub/posting',
} as const;

/**
 * Pub/Sub push message wrapper
 * This is the format that Cloud Pub/Sub sends to push endpoints
 */
export interface PubSubPushMessage<_T = unknown> {
  message: {
    data: string; // Base64 encoded JSON
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

/**
 * Helper to decode Pub/Sub message data
 */
export function decodePubSubMessage<T>(data: string): T {
  const decoded = Buffer.from(data, 'base64').toString('utf-8');
  return JSON.parse(decoded) as T;
}

/**
 * Helper to encode data for Pub/Sub message
 */
export function encodePubSubMessage<T>(data: T): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}
