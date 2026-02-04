import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let TEST_DIR: string;

// Mock config
vi.mock('../../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-mutes-test-' + process.pid + '-' + Date.now());
  return {
    PATHS: {
      configDir: testDir,
      socialDir: join(testDir, 'social'),
      socialDb: join(testDir, 'social', 'graph.db'),
    },
  };
});

import { closeSocialDb } from '../../../src/lib/social/db.js';
import {
  addMute,
  removeMute,
  isMuted,
  getMutes,
  getMuteCount,
  clearMutes,
  bulkInsertMutes,
} from '../../../src/lib/social/mutes.js';
import { PATHS } from '../../../src/config.js';

// Test fixtures
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const CHARLIE = 'c'.repeat(64);
const SPAMMER = 'd'.repeat(64);

describe('mutes module', () => {
  beforeEach(() => {
    TEST_DIR = PATHS.configDir;
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(PATHS.socialDir, { recursive: true });
  });

  afterEach(() => {
    closeSocialDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('addMute', () => {
    it('should mute a user', () => {
      addMute(SPAMMER);
      expect(isMuted(SPAMMER)).toBe(true);
    });

    it('should handle duplicate mutes (idempotent)', () => {
      addMute(SPAMMER);
      addMute(SPAMMER);
      expect(getMuteCount()).toBe(1);
    });
  });

  describe('removeMute', () => {
    it('should unmute existing user', () => {
      addMute(SPAMMER);
      expect(isMuted(SPAMMER)).toBe(true);

      const removed = removeMute(SPAMMER);
      expect(removed).toBe(true);
      expect(isMuted(SPAMMER)).toBe(false);
    });

    it('should return false for non-muted user', () => {
      const removed = removeMute(ALICE);
      expect(removed).toBe(false);
    });

    it('should not affect other mutes', () => {
      addMute(ALICE);
      addMute(BOB);

      removeMute(ALICE);
      expect(isMuted(ALICE)).toBe(false);
      expect(isMuted(BOB)).toBe(true);
    });
  });

  describe('isMuted', () => {
    it('should return true for muted user', () => {
      addMute(SPAMMER);
      expect(isMuted(SPAMMER)).toBe(true);
    });

    it('should return false for non-muted user', () => {
      expect(isMuted(ALICE)).toBe(false);
    });
  });

  describe('getMutes', () => {
    it('should return empty array when no mutes', () => {
      expect(getMutes()).toEqual([]);
    });

    it('should return all muted users', () => {
      addMute(ALICE);
      addMute(BOB);
      addMute(CHARLIE);

      const mutes = getMutes();
      expect(mutes.length).toBe(3);

      const pubkeys = mutes.map((m) => m.pubkey);
      expect(pubkeys).toContain(ALICE);
      expect(pubkeys).toContain(BOB);
      expect(pubkeys).toContain(CHARLIE);
    });

    it('should include addedAt timestamp', () => {
      addMute(SPAMMER);
      const mutes = getMutes();
      expect(mutes[0].addedAt).toBeTypeOf('number');
      expect(mutes[0].addedAt).toBeGreaterThan(0);
    });
  });

  describe('getMuteCount', () => {
    it('should return 0 when no mutes', () => {
      expect(getMuteCount()).toBe(0);
    });

    it('should return correct count', () => {
      addMute(ALICE);
      addMute(BOB);
      expect(getMuteCount()).toBe(2);

      addMute(CHARLIE);
      expect(getMuteCount()).toBe(3);
    });
  });

  describe('clearMutes', () => {
    it('should remove all mutes', () => {
      addMute(ALICE);
      addMute(BOB);
      addMute(CHARLIE);

      expect(getMuteCount()).toBe(3);

      clearMutes();
      expect(getMuteCount()).toBe(0);
      expect(getMutes()).toEqual([]);
    });
  });

  describe('bulkInsertMutes', () => {
    it('should insert multiple mutes', () => {
      bulkInsertMutes([ALICE, BOB, CHARLIE]);

      expect(getMuteCount()).toBe(3);
      expect(isMuted(ALICE)).toBe(true);
      expect(isMuted(BOB)).toBe(true);
      expect(isMuted(CHARLIE)).toBe(true);
    });

    it('should handle empty array', () => {
      bulkInsertMutes([]);
      expect(getMuteCount()).toBe(0);
    });

    it('should handle duplicates in input', () => {
      bulkInsertMutes([ALICE, ALICE, BOB]);
      expect(getMuteCount()).toBe(2);
    });

    it('should upsert existing mutes', () => {
      addMute(ALICE);
      bulkInsertMutes([ALICE, BOB]);
      expect(getMuteCount()).toBe(2);
    });
  });
});
