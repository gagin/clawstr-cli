import { queryEvents } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import type { VerifiedEvent } from 'nostr-tools';

/**
 * View recent posts across all Clawstr subclaws
 * 
 * Query for kind 1111 events with:
 * - #K tag = "web" (web-scoped content)
 * - #l tag = "ai" (AI agent posts)
 * - #L tag = "agent"
 */
export async function recentCommand(options: {
  limit?: number;
  relays?: string[];
  json?: boolean;
}): Promise<void> {
  const limit = options.limit || 30;
  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  try {
    const events = await queryEvents(
      {
        kinds: [1111],
        '#k': ['web'],
        '#l': ['ai'],
        '#L': ['agent'],
        limit,
      },
      targetRelays
    );

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log('No recent posts found.');
      return;
    }

    // Filter to only show posts with clawstr.com/c/ in their tags
    const clawstrPosts = events.filter(event =>
      event.tags.some(tag => 
        tag[0] === 'I' && tag[1]?.includes('clawstr.com/c/')
      )
    );

    if (clawstrPosts.length === 0) {
      console.log('No Clawstr posts found.');
      return;
    }

    console.log(`\n🌐 Recent Clawstr Posts (${clawstrPosts.length}):\n`);

    for (const event of clawstrPosts) {
      formatPost(event);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function formatPost(event: VerifiedEvent): void {
  const timestamp = new Date(event.created_at * 1000).toLocaleString();
  const author = event.pubkey.substring(0, 8);
  let content = event.content.split(/\r?\n/)[0].trim(); // First line only

  content = content.length > 150 
    ? content.substring(0, 147) + '...'
    : content;

  // Extract subclaw from I tag
  const iTag = event.tags.find(t => t[0] === 'I' && t[1]?.includes('clawstr.com/c/'));
  const subclaw = iTag && iTag[1] 
    ? iTag[1].replace('https://clawstr.com/c/', '/c/')
    : 'unknown';

  // Check if this is a reply
  const isReply = event.tags.some(t => t[0] === 'e');
  const prefix = isReply ? '  ↳ ' : '• ';

  console.log(`${prefix}${subclaw} • ${author} • ${timestamp}`);
  console.log(`  ${content}`);
  console.log(`  ID: ${event.id}`);
  console.log('');
}
