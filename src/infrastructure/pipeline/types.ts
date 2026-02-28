import { z } from 'zod';

/**
 * Atomic time unit for pipeline stages
 */
export const StageUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type StageUnit = z.infer<typeof StageUnitSchema>;

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
  /** If omitted, input is fetched from Slack. Otherwise, refers to a previous stage ID. */
  inputSource: z.string().optional(),
  prompt: StagePromptSchema,
});
export type StageConfig = z.infer<typeof StageConfigSchema>;

/**
 * Slack input configuration
 */
export const SlackInputSchema = z.object({
  type: z.literal('user_posts'),
  userId: z.string().min(1), // 'caller' or a fixed user ID
});
export type SlackInput = z.infer<typeof SlackInputSchema>;

/**
 * Output configuration
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
export const PipelineConfigSchema = z.object({
  id: z.string().min(1),
  command: z.string().startsWith('/'),
  description: z.string(),
  slackInput: SlackInputSchema,
  stages: z.array(StageConfigSchema).min(1),
  output: OutputConfigSchema,
});
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
