import { z } from 'zod';

/**
 * Atomic unit for pipeline stages.
 * Time-based: day | week | month | quarter | year
 * Special:    all_years = aggregate across all years in the job (enables YoY culture comparison)
 */
export const StageUnitSchema = z.enum(['day', 'week', 'month', 'quarter', 'year', 'all_years']);
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
  userId: z.string().min(1), // 'caller' or a fixed user ID
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
