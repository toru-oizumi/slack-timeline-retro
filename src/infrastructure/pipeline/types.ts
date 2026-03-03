import { z } from 'zod';

/**
 * Atomic time unit for pipeline stages.
 * Supported for base stage (range generation): week | month | year
 * Supported for aggregation grouping: week | month | quarter | year | day
 */
export const StageUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
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
  prompt: StagePromptSchema,
});
export type StageConfig = z.infer<typeof StageConfigSchema>;

/**
 * Slack input configuration
 */
export const SlackInputSchema = z.object({
  type: z.literal('user_posts'),
  /** 'caller' maps to the invoking user's ID at runtime */
  userId: z.string().min(1),
});
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
 * Full pipeline configuration loaded from YAML
 */
export const PipelineConfigSchema = z
  .object({
    id: z.string().min(1),
    command: z.string().startsWith('/'),
    description: z.string(),
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
