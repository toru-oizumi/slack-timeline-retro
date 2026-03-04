import { z } from 'zod';

/**
 * Atomic time unit for pipeline stages.
 * Time-based: day | week | month | quarter | year
 * Special:    all_years = aggregate all year-level results within the job into a single group.
 *             With one year, it produces a single-year profile; with multiple years it enables
 *             year-over-year comparison. The job must include the desired years at creation time.
 *
 * Supported for base stage (range generation): week | month | year
 * Supported for aggregation grouping: day | week | month | quarter | year | all_years
 */
export const StageUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year', 'all_years']);
export type StageUnit = z.infer<typeof StageUnitSchema>;

/** Units supported by StageUnitMapper.getRangesForYear() for base stage processing */
const SUPPORTED_BASE_UNITS = ['week', 'month', 'year'] as const;

/**
 * Per-stage prompt configuration
 */
export const StagePromptSchema = z.object({
  system: z.string().min(1),
  user: z.string().min(1), // {{input}} placeholder expected
});
export type StagePrompt = z.infer<typeof StagePromptSchema>;

/**
 * Configuration for a single pipeline stage
 */
export const StageConfigSchema = z.object({
  id: z.string().min(1),
  unit: StageUnitSchema,
  /**
   * Refers to a previous stage ID whose output this stage aggregates.
   * Parsed for documentation purposes; the runner always uses the immediately
   * preceding stage's results regardless of this value.
   */
  inputSource: z.string().optional(),
  /**
   * Optional override for the section header posted to Slack before this stage's output.
   * If set, replaces the auto-generated header (e.g. "📋 *2025年〜2026年 年次比較レポート*").
   * Set to "" (empty string) to suppress the header entirely.
   * If omitted, the header is generated automatically based on the stage unit.
   */
  header: z.string().optional(),
  prompt: StagePromptSchema,
});
export type StageConfig = z.infer<typeof StageConfigSchema>;

/**
 * Sampling configuration for channel_threads input
 */
export const SamplingConfigSchema = z.object({
  /** Scoring strategy for thread selection */
  strategy: z.enum(['top_engaged', 'random', 'recent']),
  /** Max threads to fetch per channel per week */
  maxThreadsPerWeek: z.number().int().positive(),
});
export type SamplingConfig = z.infer<typeof SamplingConfigSchema>;

/**
 * Slack input: individual user's posts (existing behavior)
 */
export const UserPostsInputSchema = z.object({
  type: z.literal('user_posts'),
  /** 'caller' maps to the invoking user's ID at runtime */
  userId: z.string().min(1),
});
export type UserPostsInput = z.infer<typeof UserPostsInputSchema>;

/**
 * Slack input: threads across specified channels (culture analysis)
 */
export const ChannelThreadsInputSchema = z.object({
  type: z.literal('channel_threads'),
  channelIds: z.array(z.string().min(1)).min(0),
  sampling: SamplingConfigSchema,
});
export type ChannelThreadsInput = z.infer<typeof ChannelThreadsInputSchema>;

/**
 * Slack input configuration (discriminated union)
 */
export const SlackInputSchema = z.discriminatedUnion('type', [
  UserPostsInputSchema,
  ChannelThreadsInputSchema,
]);
export type SlackInput = z.infer<typeof SlackInputSchema>;

/**
 * Output configuration.
 * Note: `thread` and `broadcastFinal` are parsed for future use but not yet
 * enforced — all output is currently posted to the job's self-DM thread.
 */
export const OutputConfigSchema = z.object({
  destination: z.literal('self_dm'),
  thread: z.boolean(),
  broadcastFinal: z.boolean(),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

/**
 * Optional date period to restrict pipeline processing to a specific range of months.
 * When set, overrides year-based task generation in the orchestrator.
 * Format: "YYYY-MM" (e.g. "2025-09")
 */
const validMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected format: YYYY-MM')
  .refine(
    (value) => {
      const month = Number(value.split('-')[1]);
      return Number.isInteger(month) && month >= 1 && month <= 12;
    },
    { message: 'Month must be between 01 and 12' },
  );

export const PeriodConfigSchema = z
  .object({
    /** First month inclusive (YYYY-MM) */
    start: validMonth,
    /** Last month inclusive (YYYY-MM) */
    end: validMonth,
  })
  .refine(({ start, end }) => start <= end, {
    message: 'start must be less than or equal to end',
    path: ['end'],
  });
export type PeriodConfig = z.infer<typeof PeriodConfigSchema>;

/**
 * Full pipeline configuration loaded from YAML
 */
export const PipelineConfigSchema = z
  .object({
    id: z.string().min(1),
    command: z.string().startsWith('/'),
    description: z.string(),
    /** Optional fixed date range. When set, overrides year arguments from the slash command. */
    period: PeriodConfigSchema.optional(),
    slackInput: SlackInputSchema,
    stages: z.array(StageConfigSchema).min(1),
    output: OutputConfigSchema,
  })
  .superRefine((data, ctx) => {
    const baseUnit = data.stages[0]?.unit;
    if (
      baseUnit !== undefined &&
      !SUPPORTED_BASE_UNITS.includes(baseUnit as (typeof SUPPORTED_BASE_UNITS)[number])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Base stage unit "${baseUnit}" is not supported for range generation. Use one of: ${SUPPORTED_BASE_UNITS.join(', ')}`,
        path: ['stages', 0, 'unit'],
      });
    }
  });
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
