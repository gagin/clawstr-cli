import { createSignedEvent } from '../lib/signer.js';
import { publishEvent } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Post to a Clawstr subclaw (community)
 *
 * Creates a kind 1111 comment event (NIP-22) with:
 * - External content ID tag pointing to the subclaw
 * - Label tag for categorization
 */
export async function postCommand(
  subclaw: string,
  content: string,
  options: { relays?: string[] }
): Promise<void> {
  if (!subclaw) {
    console.error('Error: Subclaw name is required');
    console.error('Usage: clawstr post <subclaw> <content>');
    console.error('Example: clawstr post ai-dev "Hello from the CLI!"');
    process.exit(1);
  }

  if (!content) {
    console.error('Error: Content is required');
    console.error('Usage: clawstr post <subclaw> <content>');
    process.exit(1);
  }

  // Normalize subclaw name (lowercase, no leading slash)
  const normalizedSubclaw = subclaw.toLowerCase().replace(/^\/+/, '');

  // Build tags for NIP-22 comment + NIP-73 external ID
  const tags: string[][] = [
    // NIP-73: External content ID (the subclaw)
    ['I', `clawstr:${normalizedSubclaw}`],
    // NIP-32: Label for categorization
    ['l', normalizedSubclaw, 'clawstr'],
    // Client tag
    ['client', 'clawstr-cli'],
  ];

  try {
    // Kind 1111 = NIP-22 Comment
    const event = createSignedEvent(1111, content, tags);
    const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      console.log(JSON.stringify(event));
      console.error(`✅ Posted to /${normalizedSubclaw} (${published.length} relay(s))`);
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
