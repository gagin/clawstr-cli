import { signEvent } from '../lib/signer.js';
import { publishEvent } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import type { EventTemplate } from 'nostr-tools/pure';

/**
 * Read stdin until EOF
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

/**
 * Sign and optionally publish a Nostr event from stdin
 * Compatible with `nak event` - reads JSON event template from stdin
 */
export async function eventCommand(
  relays: string[],
  options: { print?: boolean }
): Promise<void> {
  // Read event template from stdin
  const input = await readStdin();

  if (!input.trim()) {
    console.error('Error: No input received. Pipe a JSON event template to stdin.');
    console.error('Example: echo \'{"kind":1,"content":"Hello"}\' | clawstr event');
    process.exit(1);
  }

  let template: EventTemplate;
  try {
    template = JSON.parse(input.trim());
  } catch (error) {
    console.error('Error: Invalid JSON input');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Ensure required fields
  if (typeof template.kind !== 'number') {
    console.error('Error: Event must have a "kind" field (number)');
    process.exit(1);
  }

  if (typeof template.content !== 'string') {
    template.content = '';
  }

  if (!Array.isArray(template.tags)) {
    template.tags = [];
  }

  if (!template.created_at) {
    template.created_at = Math.floor(Date.now() / 1000);
  }

  // Sign the event
  let signedEvent;
  try {
    signedEvent = signEvent(template);
  } catch (error) {
    console.error('Error signing event:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Print-only mode (like nak event without relays)
  if (options.print || relays.length === 0) {
    console.log(JSON.stringify(signedEvent));
    return;
  }

  // Publish to relays
  const targetRelays = relays.length > 0 ? relays : DEFAULT_RELAYS;

  try {
    const published = await publishEvent(signedEvent, targetRelays);

    if (published.length > 0) {
      // Output the signed event JSON (like nak)
      console.log(JSON.stringify(signedEvent));

      // Log to stderr which relays accepted
      console.error(`Published to ${published.length}/${targetRelays.length} relay(s)`);
    } else {
      console.error('Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error publishing:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
