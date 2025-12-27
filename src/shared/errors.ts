/**
 * Application error definitions
 */

/**
 * Base error class
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
    };
  }
}

/**
 * Domain error
 */
export class DomainError extends AppError {
  readonly code = 'DOMAIN_ERROR';
  readonly statusCode = 400;
}

/**
 * Summary not found error
 */
export class SummaryNotFoundError extends AppError {
  readonly code = 'SUMMARY_NOT_FOUND';
  readonly statusCode = 404;

  constructor(type: string, period: string) {
    super(`${type} summary not found: ${period}`);
  }
}

/**
 * Posts not found error
 */
export class PostsNotFoundError extends AppError {
  readonly code = 'POSTS_NOT_FOUND';
  readonly statusCode = 404;

  constructor(period: string) {
    super(`No posts found for period: ${period}`);
  }
}

/**
 * Slack API error
 */
export class SlackAPIError extends AppError {
  readonly code = 'SLACK_API_ERROR';
  readonly statusCode = 502;

  constructor(
    message: string,
    public readonly slackError?: string
  ) {
    super(`Slack API error: ${message}`);
  }
}

/**
 * AI service error
 */
export class AIServiceError extends AppError {
  readonly code = 'AI_SERVICE_ERROR';
  readonly statusCode = 502;

  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(`AI generation error: ${message}`);
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message = 'Request authentication failed') {
    super(message);
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
  }
}

/**
 * Result type for error handling
 */
export type Result<T, E extends Error = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
