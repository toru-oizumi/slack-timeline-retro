import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { PipelineConfig } from './types';
import { PipelineConfigSchema } from './types';

/**
 * Module-level cache survives across requests within the same Cloud Run instance,
 * avoiding repeated synchronous file IO per request.
 */
const moduleCache = new Map<string, PipelineConfig>();

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
      throw new Error(
        `Invalid pipeline ID "${pipelineId}": must match [a-z0-9_-]+`
      );
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
      throw new Error(
        `Invalid pipeline config "${pipelineId}": ${result.error.message}`
      );
    }

    if (result.data.id !== pipelineId) {
      throw new Error(
        `Pipeline config ID mismatch for "${pipelineId}": YAML id is "${result.data.id}"`
      );
    }

    moduleCache.set(pipelineId, result.data);
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
