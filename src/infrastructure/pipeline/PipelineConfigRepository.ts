import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ChannelThreadsInput, PipelineConfig } from './types';
import { PipelineConfigSchema } from './types';

/**
 * Module-level cache survives across requests within the same Cloud Run instance,
 * avoiding repeated synchronous file IO per request.
 */
const moduleCache = new Map<string, PipelineConfig>();

/**
 * Derive the env var name for channelIds override from a pipeline ID.
 * e.g. "culture-analysis" → "CULTURE_ANALYSIS_CHANNEL_IDS"
 */
function channelIdsEnvKey(pipelineId: string): string {
  return `${pipelineId.toUpperCase().replace(/-/g, '_')}_CHANNEL_IDS`;
}

/**
 * Apply environment variable overrides to a pipeline config.
 * Currently supports overriding channelIds for channel_threads pipelines
 * via <PIPELINE_ID>_CHANNEL_IDS env var (comma-separated).
 */
function applyEnvOverrides(pipelineId: string, config: PipelineConfig): PipelineConfig {
  if (config.slackInput.type !== 'channel_threads') {
    return config;
  }

  const envKey = channelIdsEnvKey(pipelineId);
  const envValue = process.env[envKey];
  if (!envValue) {
    return config;
  }

  const ids = envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...config,
    slackInput: { ...(config.slackInput as ChannelThreadsInput), channelIds: ids },
  };
}

/**
 * Repository for loading and caching pipeline configurations from YAML files.
 * YAMLファイルからパイプライン設定を読み込み、キャッシュする。
 */
export class PipelineConfigRepository {
  private readonly configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? join(process.cwd(), 'config', 'pipelines');
  }

  /**
   * Load a pipeline configuration by ID.
   * Parses and validates the YAML file on first access, then caches the result.
   */
  getById(pipelineId: string): PipelineConfig {
    // Prevent path traversal: only allow alphanumeric, hyphens, and underscores
    if (!/^[a-z0-9_-]+$/i.test(pipelineId)) {
      throw new Error(`Invalid pipeline ID "${pipelineId}": must match [a-z0-9_-]+`);
    }

    const cached = moduleCache.get(pipelineId);
    if (cached) {
      return cached;
    }

    const filePath = join(this.configDir, `${pipelineId}.yaml`);
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      throw new Error(`Pipeline config not found: ${filePath}`);
    }

    const parsed = parse(raw) as unknown;
    const result = PipelineConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid pipeline config "${pipelineId}": ${result.error.message}`);
    }

    if (result.data.id !== pipelineId) {
      throw new Error(
        `Pipeline config ID mismatch for "${pipelineId}": YAML id is "${result.data.id}"`
      );
    }

    const config = applyEnvOverrides(pipelineId, result.data);

    if (
      config.slackInput.type === 'channel_threads' &&
      (config.slackInput as ChannelThreadsInput).channelIds.length === 0
    ) {
      const envKey = channelIdsEnvKey(pipelineId);
      throw new Error(
        `Pipeline "${pipelineId}" has no channelIds configured. ` +
          `Set ${envKey}=id1,id2 or add real Slack channel IDs to config/pipelines/${pipelineId}.yaml before enabling.`
      );
    }

    moduleCache.set(pipelineId, config);
    return config;
  }

  /**
   * Load all pipeline configs for the given IDs at once.
   * Used during server startup to validate configs eagerly.
   */
  loadAll(pipelineIds: string[]): PipelineConfig[] {
    return pipelineIds.map((id) => this.getById(id));
  }

  /**
   * Find a pipeline config by Slack command string (e.g. '/summarize-2025').
   */
  findByCommand(command: string): PipelineConfig | undefined {
    for (const config of moduleCache.values()) {
      if (config.command === command) {
        return config;
      }
    }
    return undefined;
  }

  /** Clear the in-memory cache (mainly for testing). */
  clearCache(): void {
    moduleCache.clear();
  }
}
