import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let TEST_DIR: string;

// Mock config
vi.mock('../../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-graph-test-' + process.pid + '-' + Date.now());
  return {
    PATHS: {
      configDir: testDir,
      socialDir: join(testDir, 'social'),
      socialDb: join(testDir, 'social', 'graph.db'),
    },
  };
});

import { closeSocialDb } from '../../../src/lib/social/db.js';
import { addContact, clearContacts } from '../../../src/lib/social/contacts.js';
import { addMute, clearMutes } from '../../../src/lib/social/mutes.js';
import {
  updateGraphCache,
  getTrustDistance,
  filterByTrustDistance,
  clearGraphCache,
  getGraphStats,
} from '../../../src/lib/social/graph.js';
import { PATHS } from '../../../src/config.js';

// Test fixtures - social graph structure:
// ME -> follows [ALICE, BOB]
// ALICE -> follows [CHARLIE, DAVE]
// BOB -> follows [DAVE, EVE]
// CHARLIE -> follows [FRANK]
const ME = 'm'.repeat(64);
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const CHARLIE = 'c'.repeat(64);
const DAVE = 'd'.repeat(64);
const EVE = 'e'.repeat(64);
const FRANK = 'f'.repeat(64);
const STRANGER = 's'.repeat(64);
const SPAMMER = 'x'.repeat(64);

describe('graph module', () => {
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

  describe('getTrustDistance', () => {
    beforeEach(() => {
      // Set up: I follow Alice and Bob
      addContact(ALICE);
      addContact(BOB);

      // Alice follows Charlie and Dave (distance 2 from me)
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);
      // Bob follows Dave and Eve (distance 2 from me)
      updateGraphCache(BOB, [DAVE, EVE], 1);
    });

    it('should return 0 for self', () => {
      expect(getTrustDistance(ME, ME)).toBe(0);
    });

    it('should return 1 for direct follows', () => {
      expect(getTrustDistance(ALICE, ME)).toBe(1);
      expect(getTrustDistance(BOB, ME)).toBe(1);
    });

    it('should return 2 for follows of follows', () => {
      expect(getTrustDistance(CHARLIE, ME)).toBe(2);
      expect(getTrustDistance(DAVE, ME)).toBe(2);
      expect(getTrustDistance(EVE, ME)).toBe(2);
    });

    it('should return null for strangers', () => {
      expect(getTrustDistance(STRANGER, ME)).toBeNull();
    });
  });

  describe('filterByTrustDistance', () => {
    beforeEach(() => {
      // Set up social graph
      addContact(ALICE);
      addContact(BOB);
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);
      updateGraphCache(BOB, [EVE], 1);
      // Mute spammer
      addMute(SPAMMER);
    });

    it('should keep self with distance 0', () => {
      const result = filterByTrustDistance([ME], ME, 0);
      expect(result).toEqual([ME]);
    });

    it('should keep direct follows with distance 1', () => {
      const result = filterByTrustDistance([ALICE, BOB, CHARLIE], ME, 1);
      expect(result).toContain(ALICE);
      expect(result).toContain(BOB);
      expect(result).not.toContain(CHARLIE);
    });

    it('should keep follows of follows with distance 2', () => {
      const result = filterByTrustDistance([ALICE, CHARLIE, DAVE, EVE], ME, 2);
      expect(result).toContain(ALICE);
      expect(result).toContain(CHARLIE);
      expect(result).toContain(DAVE);
      expect(result).toContain(EVE);
    });

    it('should filter out strangers', () => {
      const result = filterByTrustDistance([ALICE, STRANGER], ME, 2);
      expect(result).toContain(ALICE);
      expect(result).not.toContain(STRANGER);
    });

    it('should filter out muted users regardless of distance', () => {
      // Even if spammer was somehow in our graph
      addContact(SPAMMER);
      const result = filterByTrustDistance([ALICE, SPAMMER], ME, 2);
      expect(result).toContain(ALICE);
      expect(result).not.toContain(SPAMMER);
    });

    it('should handle empty input', () => {
      const result = filterByTrustDistance([], ME, 2);
      expect(result).toEqual([]);
    });
  });

  describe('updateGraphCache', () => {
    it('should cache follows', () => {
      addContact(ALICE);
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);

      expect(getTrustDistance(CHARLIE, ME)).toBe(2);
      expect(getTrustDistance(DAVE, ME)).toBe(2);
    });

    it('should handle empty follows list', () => {
      addContact(ALICE);
      updateGraphCache(ALICE, [], 1);

      const stats = getGraphStats();
      expect(stats.totalEdges).toBe(0);
    });

    it('should update existing cache entries', () => {
      addContact(ALICE);
      updateGraphCache(ALICE, [CHARLIE], 1);
      updateGraphCache(ALICE, [DAVE], 1);

      // Should have both cached
      expect(getTrustDistance(CHARLIE, ME)).toBe(2);
      expect(getTrustDistance(DAVE, ME)).toBe(2);
    });
  });

  describe('clearGraphCache', () => {
    it('should clear all cached edges', () => {
      addContact(ALICE);
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);

      let stats = getGraphStats();
      expect(stats.totalEdges).toBeGreaterThan(0);

      clearGraphCache();

      stats = getGraphStats();
      expect(stats.totalEdges).toBe(0);
    });

    it('should not affect contacts', () => {
      addContact(ALICE);
      addContact(BOB);
      updateGraphCache(ALICE, [CHARLIE], 1);

      clearGraphCache();

      // Contacts should still work for distance 1
      expect(getTrustDistance(ALICE, ME)).toBe(1);
      expect(getTrustDistance(BOB, ME)).toBe(1);
    });
  });

  describe('getGraphStats', () => {
    it('should return zeros for empty graph', () => {
      const stats = getGraphStats();
      expect(stats.totalNodes).toBe(0);
      expect(stats.totalEdges).toBe(0);
      expect(stats.maxDistance).toBe(0);
    });

    it('should count nodes and edges correctly', () => {
      addContact(ALICE);
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);
      updateGraphCache(BOB, [EVE], 1);

      const stats = getGraphStats();
      expect(stats.totalNodes).toBe(3); // CHARLIE, DAVE, EVE
      expect(stats.totalEdges).toBe(3); // 3 edges total
    });

    it('should track max distance', () => {
      updateGraphCache(ALICE, [CHARLIE], 1);
      updateGraphCache(BOB, [DAVE], 2);

      const stats = getGraphStats();
      expect(stats.maxDistance).toBe(2);
    });
  });

  describe('integration: web of trust filtering', () => {
    beforeEach(() => {
      // Build a more complex graph
      addContact(ALICE);
      addContact(BOB);

      // Alice's network
      updateGraphCache(ALICE, [CHARLIE, DAVE], 1);

      // Bob's network
      updateGraphCache(BOB, [EVE], 1);

      // Mute bad actors
      addMute(SPAMMER);
    });

    it('should correctly filter a realistic feed', () => {
      const feedAuthors = [
        ME,         // self
        ALICE,      // distance 1
        BOB,        // distance 1
        CHARLIE,    // distance 2
        DAVE,       // distance 2
        EVE,        // distance 2
        STRANGER,   // not in graph
        SPAMMER,    // muted
      ];

      // Distance 1 filter (only me and direct follows)
      const close = filterByTrustDistance(feedAuthors, ME, 1);
      expect(close).toEqual([ME, ALICE, BOB]);

      // Distance 2 filter (includes follows of follows)
      const extended = filterByTrustDistance(feedAuthors, ME, 2);
      expect(extended).toContain(ME);
      expect(extended).toContain(ALICE);
      expect(extended).toContain(BOB);
      expect(extended).toContain(CHARLIE);
      expect(extended).toContain(DAVE);
      expect(extended).toContain(EVE);
      expect(extended).not.toContain(STRANGER);
      expect(extended).not.toContain(SPAMMER);
    });
  });
});
