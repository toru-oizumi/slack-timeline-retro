import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ChannelThreadsInput, PipelineConfig } from './types';
import { PipelineConfigSchema } from './types';

/**
 * Repository for loading and caching pipeline configurations from YAML files.
 * YAMLファイルからパイプライン設定を読み込み、キャッシュする。
 */
export class PipelineConfigRepository {
  private readonly cache = new Map<string, PipelineConfig>();
  private readonly configDir: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? join(process.cwd(), 'config', 'pipelines');
  }

  /**
   * Load a pipeline configuration by ID.
   * Parses and validates the YAML file on first access, then caches the result.
   */
  getById(pipelineId: string): PipelineConfig {
    const cached = this.cache.get(pipelineId);
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
      throw new Error(
        `Invalid pipeline config "${pipelineId}": ${result.error.message}`
      );
    }

    if (
      result.data.slackInput.type === 'channel_threads' &&
      (result.data.slackInput as ChannelThreadsInput).channelIds.length === 0
    ) {
      throw new Error(
        `Pipeline "${pipelineId}" has no channelIds configured. ` +
          `Add real Slack channel IDs to config/pipelines/${pipelineId}.yaml before enabling.`
      );
    }

    this.cache.set(pipelineId, result.data);
    return result.data;
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
    for (const config of this.cache.values()) {
      if (config.command === command) {
        return config;
      }
    }
    return undefined;
  }

  /** Clear the in-memory cache (mainly for testing). */
  clearCache(): void {
    this.cache.clear();
  }
}
