import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let TEST_DIR: string;

// Mock config
vi.mock('../../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-contacts-test-' + process.pid + '-' + Date.now());
  return {
    PATHS: {
      configDir: testDir,
      socialDir: join(testDir, 'social'),
      socialDb: join(testDir, 'social', 'graph.db'),
    },
  };
});

// Must import after mocking
import { closeSocialDb } from '../../../src/lib/social/db.js';
import {
  addContact,
  removeContact,
  isContact,
  getContacts,
  getContactCount,
  clearContacts,
  bulkInsertContacts,
} from '../../../src/lib/social/contacts.js';
import { PATHS } from '../../../src/config.js';

// Test fixtures
const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const CHARLIE = 'c'.repeat(64);

describe('contacts module', () => {
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

  describe('addContact', () => {
    it('should add a contact', () => {
      addContact(ALICE);
      expect(isContact(ALICE)).toBe(true);
    });

    it('should add contact with relay', () => {
      addContact(ALICE, 'wss://relay.damus.io');
      const contacts = getContacts();
      const alice = contacts.find((c) => c.pubkey === ALICE);
      expect(alice?.relay).toBe('wss://relay.damus.io');
    });

    it('should add contact with petname', () => {
      addContact(ALICE, undefined, 'alice');
      const contacts = getContacts();
      const alice = contacts.find((c) => c.pubkey === ALICE);
      expect(alice?.petname).toBe('alice');
    });

    it('should add contact with relay and petname', () => {
      addContact(ALICE, 'wss://relay.damus.io', 'alice');
      const contacts = getContacts();
      const alice = contacts.find((c) => c.pubkey === ALICE);
      expect(alice?.relay).toBe('wss://relay.damus.io');
      expect(alice?.petname).toBe('alice');
    });

    it('should update existing contact (upsert)', () => {
      addContact(ALICE, 'wss://old-relay.com', 'old-name');
      addContact(ALICE, 'wss://new-relay.com', 'new-name');

      const contacts = getContacts();
      expect(contacts.length).toBe(1);
      expect(contacts[0].relay).toBe('wss://new-relay.com');
      expect(contacts[0].petname).toBe('new-name');
    });
  });

  describe('removeContact', () => {
    it('should remove existing contact', () => {
      addContact(ALICE);
      expect(isContact(ALICE)).toBe(true);

      const removed = removeContact(ALICE);
      expect(removed).toBe(true);
      expect(isContact(ALICE)).toBe(false);
    });

    it('should return false for non-existent contact', () => {
      const removed = removeContact(BOB);
      expect(removed).toBe(false);
    });

    it('should not affect other contacts', () => {
      addContact(ALICE);
      addContact(BOB);

      removeContact(ALICE);
      expect(isContact(ALICE)).toBe(false);
      expect(isContact(BOB)).toBe(true);
    });
  });

  describe('isContact', () => {
    it('should return true for existing contact', () => {
      addContact(ALICE);
      expect(isContact(ALICE)).toBe(true);
    });

    it('should return false for non-existent contact', () => {
      expect(isContact(ALICE)).toBe(false);
    });
  });

  describe('getContacts', () => {
    it('should return empty array when no contacts', () => {
      expect(getContacts()).toEqual([]);
    });

    it('should return all contacts', () => {
      addContact(ALICE);
      addContact(BOB);
      addContact(CHARLIE);

      const contacts = getContacts();
      expect(contacts.length).toBe(3);

      const pubkeys = contacts.map((c) => c.pubkey);
      expect(pubkeys).toContain(ALICE);
      expect(pubkeys).toContain(BOB);
      expect(pubkeys).toContain(CHARLIE);
    });

    it('should include addedAt timestamp', () => {
      addContact(ALICE);
      const contacts = getContacts();
      expect(contacts[0].addedAt).toBeTypeOf('number');
      expect(contacts[0].addedAt).toBeGreaterThan(0);
    });
  });

  describe('getContactCount', () => {
    it('should return 0 when no contacts', () => {
      expect(getContactCount()).toBe(0);
    });

    it('should return correct count', () => {
      addContact(ALICE);
      addContact(BOB);
      expect(getContactCount()).toBe(2);

      addContact(CHARLIE);
      expect(getContactCount()).toBe(3);
    });
  });

  describe('clearContacts', () => {
    it('should remove all contacts', () => {
      addContact(ALICE);
      addContact(BOB);
      addContact(CHARLIE);

      expect(getContactCount()).toBe(3);

      clearContacts();
      expect(getContactCount()).toBe(0);
      expect(getContacts()).toEqual([]);
    });
  });

  describe('bulkInsertContacts', () => {
    it('should insert multiple contacts', () => {
      bulkInsertContacts([
        { pubkey: ALICE },
        { pubkey: BOB, relay: 'wss://relay.test' },
        { pubkey: CHARLIE, petname: 'charlie' },
      ]);

      expect(getContactCount()).toBe(3);
      expect(isContact(ALICE)).toBe(true);
      expect(isContact(BOB)).toBe(true);
      expect(isContact(CHARLIE)).toBe(true);
    });

    it('should handle empty array', () => {
      bulkInsertContacts([]);
      expect(getContactCount()).toBe(0);
    });

    it('should upsert existing contacts', () => {
      addContact(ALICE, 'wss://old.relay');
      bulkInsertContacts([{ pubkey: ALICE, relay: 'wss://new.relay' }]);

      const contacts = getContacts();
      expect(contacts.length).toBe(1);
      expect(contacts[0].relay).toBe('wss://new.relay');
    });
  });
});
