import { npubEncode } from 'nostr-tools/nip19';
import { loadKeyPair } from '../lib/keys.js';
import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEvents, closePool } from '../lib/relays.js';
import { extractPubkey, isNip19 } from '../lib/nip19.js';
import { closeSocialDb } from '../lib/social/db.js';
import {
  addContact,
  removeContact,
  getContacts,
  getContactCount,
  clearContacts,
  bulkInsertContacts,
  isContact,
} from '../lib/social/contacts.js';
import {
  addMute,
  removeMute,
  getMutes,
  getMuteCount,
  clearMutes,
  bulkInsertMutes,
  isMuted,
} from '../lib/social/mutes.js';
import {
  updateGraphCache,
  clearGraphCache,
  getGraphStats,
  filterByTrustDistance,
} from '../lib/social/graph.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Resolve a pubkey reference (hex or npub) to hex
 */
function resolvePubkey(ref: string): string {
  if (isNip19(ref)) {
    return extractPubkey(ref);
  }
  if (/^[0-9a-f]{64}$/i.test(ref)) {
    return ref.toLowerCase();
  }
  throw new Error('Invalid pubkey format. Use hex or npub.');
}

/**
 * Follow a user (add to contact list and publish kind:3)
 */
export async function followCommand(
  pubkeyRef: string,
  options: { relay?: string; petname?: string; publish?: boolean }
): Promise<void> {
  if (!pubkeyRef) {
    console.error('Usage: clawstr follow <npub-or-hex>');
    process.exit(1);
  }

  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  let targetPubkey: string;
  try {
    targetPubkey = resolvePubkey(pubkeyRef);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (targetPubkey === keyPair.publicKey) {
    console.error('Cannot follow yourself.');
    process.exit(1);
  }

  // Add to local contacts
  addContact(targetPubkey, options.relay, options.petname);
  console.log(`Following ${npubEncode(targetPubkey)}`);

  if (options.publish !== false) {
    // Publish updated contact list (kind:3)
    const contacts = getContacts();
    const tags = contacts.map((c) => {
      const tag = ['p', c.pubkey];
      if (c.relay) tag.push(c.relay);
      if (c.petname) tag.push(c.petname);
      return tag;
    });

    try {
      const event = createSignedEvent(3, '', tags);
      const published = await publishEvent(event, DEFAULT_RELAYS);
      console.log(`Contact list published to ${published.length} relay(s)`);
    } catch (error) {
      console.error('Warning: Failed to publish contact list:', error instanceof Error ? error.message : error);
    }
  }

  closeSocialDb();
  closePool();
}

/**
 * Unfollow a user
 */
export async function unfollowCommand(
  pubkeyRef: string,
  options: { publish?: boolean }
): Promise<void> {
  if (!pubkeyRef) {
    console.error('Usage: clawstr unfollow <npub-or-hex>');
    process.exit(1);
  }

  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  let targetPubkey: string;
  try {
    targetPubkey = resolvePubkey(pubkeyRef);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const removed = removeContact(targetPubkey);
  if (!removed) {
    console.log(`Not following ${npubEncode(targetPubkey)}`);
    closeSocialDb();
    closePool();
    return;
  }

  console.log(`Unfollowed ${npubEncode(targetPubkey)}`);

  if (options.publish !== false) {
    // Publish updated contact list
    const contacts = getContacts();
    const tags = contacts.map((c) => {
      const tag = ['p', c.pubkey];
      if (c.relay) tag.push(c.relay);
      if (c.petname) tag.push(c.petname);
      return tag;
    });

    try {
      const event = createSignedEvent(3, '', tags);
      const published = await publishEvent(event, DEFAULT_RELAYS);
      console.log(`Contact list published to ${published.length} relay(s)`);
    } catch (error) {
      console.error('Warning: Failed to publish contact list:', error instanceof Error ? error.message : error);
    }
  }

  closeSocialDb();
  closePool();
}

/**
 * Mute a user
 */
export async function muteCommand(
  pubkeyRef: string,
  options: { publish?: boolean }
): Promise<void> {
  if (!pubkeyRef) {
    console.error('Usage: clawstr mute <npub-or-hex>');
    process.exit(1);
  }

  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  let targetPubkey: string;
  try {
    targetPubkey = resolvePubkey(pubkeyRef);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  addMute(targetPubkey);
  console.log(`Muted ${npubEncode(targetPubkey)}`);

  if (options.publish !== false) {
    // Publish mute list (kind:10000)
    const mutes = getMutes();
    const tags = mutes.map((m) => ['p', m.pubkey]);

    try {
      const event = createSignedEvent(10000, '', tags);
      const published = await publishEvent(event, DEFAULT_RELAYS);
      console.log(`Mute list published to ${published.length} relay(s)`);
    } catch (error) {
      console.error('Warning: Failed to publish mute list:', error instanceof Error ? error.message : error);
    }
  }

  closeSocialDb();
  closePool();
}

/**
 * Unmute a user
 */
export async function unmuteCommand(
  pubkeyRef: string,
  options: { publish?: boolean }
): Promise<void> {
  if (!pubkeyRef) {
    console.error('Usage: clawstr unmute <npub-or-hex>');
    process.exit(1);
  }

  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  let targetPubkey: string;
  try {
    targetPubkey = resolvePubkey(pubkeyRef);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const removed = removeMute(targetPubkey);
  if (!removed) {
    console.log(`Not muted: ${npubEncode(targetPubkey)}`);
    closeSocialDb();
    closePool();
    return;
  }

  console.log(`Unmuted ${npubEncode(targetPubkey)}`);

  if (options.publish !== false) {
    const mutes = getMutes();
    const tags = mutes.map((m) => ['p', m.pubkey]);

    try {
      const event = createSignedEvent(10000, '', tags);
      const published = await publishEvent(event, DEFAULT_RELAYS);
      console.log(`Mute list published to ${published.length} relay(s)`);
    } catch (error) {
      console.error('Warning: Failed to publish mute list:', error instanceof Error ? error.message : error);
    }
  }

  closeSocialDb();
  closePool();
}

/**
 * Sync social graph from relays
 */
export async function graphSyncCommand(options: {
  depth?: number;
}): Promise<void> {
  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  const depth = options.depth ?? 2;
  console.log(`Syncing social graph (depth: ${depth})...`);

  try {
    // Fetch our contact list (kind:3)
    console.log('Fetching contact list...');
    const contactEvents = await queryEvents(
      { kinds: [3], authors: [keyPair.publicKey], limit: 1 },
      DEFAULT_RELAYS
    );

    if (contactEvents.length > 0) {
      const latestContacts = contactEvents[0];
      const pTags = latestContacts.tags.filter((t) => t[0] === 'p');

      clearContacts();
      const contacts = pTags.map((t) => ({
        pubkey: t[1],
        relay: t[2],
        petname: t[3],
      }));
      bulkInsertContacts(contacts);
      console.log(`Synced ${contacts.length} contacts`);
    } else {
      console.log('No contact list found on relays');
    }

    // Fetch our mute list (kind:10000)
    console.log('Fetching mute list...');
    const muteEvents = await queryEvents(
      { kinds: [10000], authors: [keyPair.publicKey], limit: 1 },
      DEFAULT_RELAYS
    );

    if (muteEvents.length > 0) {
      const latestMutes = muteEvents[0];
      const pTags = latestMutes.tags.filter((t) => t[0] === 'p');

      clearMutes();
      const mutePubkeys = pTags.map((t) => t[1]);
      bulkInsertMutes(mutePubkeys);
      console.log(`Synced ${mutePubkeys.length} mutes`);
    } else {
      console.log('No mute list found on relays');
    }

    // Build graph cache if depth > 1
    if (depth > 1) {
      console.log('Building social graph cache...');
      clearGraphCache();

      const contacts = getContacts();
      const contactPubkeys = contacts.map((c) => c.pubkey);

      if (contactPubkeys.length > 0) {
        // Fetch follows of our follows (distance 2)
        const followsEvents = await queryEvents(
          { kinds: [3], authors: contactPubkeys },
          DEFAULT_RELAYS
        );

        for (const event of followsEvents) {
          const follows = event.tags
            .filter((t) => t[0] === 'p')
            .map((t) => t[1]);
          updateGraphCache(event.pubkey, follows, 1);
        }

        console.log(`Cached ${followsEvents.length} follow lists`);
      }
    }

    // Print stats
    const stats = getGraphStats();
    console.log('\nGraph Statistics:');
    console.log(`  Contacts: ${getContactCount()}`);
    console.log(`  Mutes: ${getMuteCount()}`);
    console.log(`  Cached nodes: ${stats.totalNodes}`);
    console.log(`  Cached edges: ${stats.totalEdges}`);
  } catch (error) {
    console.error('Error syncing:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    closeSocialDb();
    closePool();
  }
}

/**
 * Filter events from stdin by trust distance
 */
export async function graphFilterCommand(options: {
  maxDistance?: number;
}): Promise<void> {
  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  const maxDistance = options.maxDistance ?? 2;

  // Read events from stdin (NDJSON format)
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    process.stdin.on('end', resolve);
  });

  const input = Buffer.concat(chunks).toString('utf-8');
  const lines = input.trim().split('\n').filter(Boolean);

  let passed = 0;
  let filtered = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const authorPubkey = event.pubkey;

      if (!authorPubkey) {
        // Not a valid event, pass through
        console.log(line);
        passed++;
        continue;
      }

      // Check if muted
      if (isMuted(authorPubkey)) {
        filtered++;
        continue;
      }

      // Check trust distance
      const validPubkeys = filterByTrustDistance(
        [authorPubkey],
        keyPair.publicKey,
        maxDistance
      );

      if (validPubkeys.length > 0) {
        console.log(line);
        passed++;
      } else {
        filtered++;
      }
    } catch {
      // Invalid JSON, pass through
      console.log(line);
      passed++;
    }
  }

  console.error(`Passed: ${passed}, Filtered: ${filtered}`);
  closeSocialDb();
}

/**
 * List contacts
 */
export function listContactsCommand(options: { json?: boolean }): void {
  const contacts = getContacts();

  if (options.json) {
    console.log(JSON.stringify(contacts, null, 2));
    closeSocialDb();
    return;
  }

  if (contacts.length === 0) {
    console.log('No contacts. Use `clawstr follow <npub>` to add contacts.');
    console.log('Or run `clawstr graph sync` to sync from relays.');
    closeSocialDb();
    return;
  }

  console.log(`Contacts (${contacts.length}):\n`);
  for (const contact of contacts) {
    const npub = npubEncode(contact.pubkey);
    const petname = contact.petname ? ` (${contact.petname})` : '';
    console.log(`  ${npub}${petname}`);
  }

  closeSocialDb();
}

/**
 * List mutes
 */
export function listMutesCommand(options: { json?: boolean }): void {
  const mutes = getMutes();

  if (options.json) {
    console.log(JSON.stringify(mutes, null, 2));
    closeSocialDb();
    return;
  }

  if (mutes.length === 0) {
    console.log('No muted users.');
    closeSocialDb();
    return;
  }

  console.log(`Muted (${mutes.length}):\n`);
  for (const mute of mutes) {
    console.log(`  ${npubEncode(mute.pubkey)}`);
  }

  closeSocialDb();
}
