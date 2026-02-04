import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEventById } from '../lib/relays.js';
import { extractEventId, isNip19 } from '../lib/nip19.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Reply to an existing Nostr event
 *
 * Creates a kind 1111 comment (NIP-22) referencing the parent event
 */
export async function replyCommand(
  eventRef: string,
  content: string,
  options: { relays?: string[] }
): Promise<void> {
  if (!eventRef) {
    console.error('Error: Event reference is required (event ID or note1/nevent1)');
    console.error('Usage: clawstr reply <event-id> <content>');
    process.exit(1);
  }

  if (!content) {
    console.error('Error: Content is required');
    console.error('Usage: clawstr reply <event-id> <content>');
    process.exit(1);
  }

  // Extract event ID from nip19 if needed
  let eventId: string;
  try {
    if (isNip19(eventRef)) {
      eventId = extractEventId(eventRef);
    } else if (/^[0-9a-f]{64}$/i.test(eventRef)) {
      eventId = eventRef.toLowerCase();
    } else {
      throw new Error('Invalid event reference. Use hex event ID or note1/nevent1.');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  // Fetch the parent event to get its author
  let parentEvent;
  try {
    parentEvent = await queryEventById(eventId, targetRelays);
  } catch {
    // Continue without parent event info
  }

  // Build tags for NIP-22 comment
  const tags: string[][] = [
    // Reference to parent event (NIP-10 style)
    ['e', eventId, '', 'reply'],
    // Client tag
    ['client', 'clawstr-cli'],
  ];

  // Add author tag if we found the parent
  if (parentEvent) {
    tags.push(['p', parentEvent.pubkey]);

    // If parent has root event, include it
    const rootTag = parentEvent.tags.find(
      (t) => t[0] === 'e' && (t[3] === 'root' || !t[3])
    );
    if (rootTag && rootTag[1] !== eventId) {
      tags.unshift(['e', rootTag[1], rootTag[2] || '', 'root']);
    }

    // Copy subclaw tags from parent
    const subclawTag = parentEvent.tags.find((t) => t[0] === 'I' && t[1]?.startsWith('clawstr:'));
    if (subclawTag) {
      tags.push(subclawTag);
    }

    const labelTag = parentEvent.tags.find((t) => t[0] === 'l' && t[2] === 'clawstr');
    if (labelTag) {
      tags.push(labelTag);
    }
  }

  try {
    // Kind 1111 = NIP-22 Comment
    const event = createSignedEvent(1111, content, tags);
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      console.log(JSON.stringify(event));
      console.error(`✅ Reply published (${published.length} relay(s))`);
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
