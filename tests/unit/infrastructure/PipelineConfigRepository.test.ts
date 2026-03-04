import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineConfigRepository } from '@/infrastructure/pipeline/PipelineConfigRepository';

const FIXTURES_DIR = join(import.meta.dirname, '../../fixtures/pipelines');

describe('PipelineConfigRepository', () => {
  let repo: PipelineConfigRepository;

  beforeEach(() => {
    repo = new PipelineConfigRepository(FIXTURES_DIR);
    repo.clearCache();
  });

  afterEach(() => {
    repo.clearCache();
    vi.unstubAllEnvs();
  });

  describe('getById - channel_threads channelIds override', () => {
    it('uses channelIds from YAML when env var is not set', () => {
      // fixture: has-channels.yaml contains channelIds: [C111, C222]
      const config = repo.getById('has-channels');
      expect(config.slackInput.type).toBe('channel_threads');
      // @ts-expect-error discriminated union
      expect(config.slackInput.channelIds).toEqual(['C111', 'C222']);
    });

    it('overrides channelIds from env var when YAML has empty channelIds', () => {
      vi.stubEnv('NO_CHANNELS_CHANNEL_IDS', 'CKW35PFDJ,CG8B754J2');

      const config = repo.getById('no-channels');
      expect(config.slackInput.type).toBe('channel_threads');
      // @ts-expect-error discriminated union
      expect(config.slackInput.channelIds).toEqual(['CKW35PFDJ', 'CG8B754J2']);
    });

    it('trims whitespace in env var channel IDs', () => {
      vi.stubEnv('NO_CHANNELS_CHANNEL_IDS', ' CKW35PFDJ , CG8B754J2 ');

      const config = repo.getById('no-channels');
      // @ts-expect-error discriminated union
      expect(config.slackInput.channelIds).toEqual(['CKW35PFDJ', 'CG8B754J2']);
    });

    it('env var overrides YAML channelIds when both are present', () => {
      vi.stubEnv('HAS_CHANNELS_CHANNEL_IDS', 'CNEW1,CNEW2');

      repo.clearCache(); // ensure no cached value from previous test
      const config = repo.getById('has-channels');
      // @ts-expect-error discriminated union
      expect(config.slackInput.channelIds).toEqual(['CNEW1', 'CNEW2']);
    });

    it('throws when channelIds is empty and no env var is set', () => {
      expect(() => repo.getById('no-channels')).toThrow(/no channelIds configured/);
    });

    it('throws helpful message with env var name when channelIds is missing', () => {
      expect(() => repo.getById('no-channels')).toThrow(/NO_CHANNELS_CHANNEL_IDS/);
    });
  });

  describe('getById - general', () => {
    it('throws for invalid pipeline ID (path traversal)', () => {
      expect(() => repo.getById('../secret')).toThrow(/Invalid pipeline ID/);
    });

    it('throws when YAML file does not exist', () => {
      expect(() => repo.getById('nonexistent')).toThrow(/Pipeline config not found/);
    });
  });

  describe('findByCommand', () => {
    it('returns config for registered command', () => {
      vi.stubEnv('HAS_CHANNELS_CHANNEL_IDS', 'C111,C222');
      repo.loadAll(['has-channels']);
      const config = repo.findByCommand('/test-has-channels');
      expect(config).toBeDefined();
      expect(config?.id).toBe('has-channels');
    });

    it('returns undefined for unknown command', () => {
      expect(repo.findByCommand('/unknown')).toBeUndefined();
    });
  });
});
