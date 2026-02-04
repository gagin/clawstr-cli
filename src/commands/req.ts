import { queryEvents, closePool } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import type { Filter } from 'nostr-tools';

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
 * Query relays with a filter from stdin
 * Compatible with `nak req` - reads JSON filter from stdin, outputs events
 */
export async function reqCommand(
  relays: string[],
  options: { limit?: number; stream?: boolean }
): Promise<void> {
  // Read filter from stdin
  const input = await readStdin();

  if (!input.trim()) {
    console.error('Error: No input received. Pipe a JSON filter to stdin.');
    console.error('Example: echo \'{"kinds":[1],"limit":10}\' | clawstr req');
    process.exit(1);
  }

  let filter: Filter | Filter[];
  try {
    filter = JSON.parse(input.trim());
  } catch (error) {
    console.error('Error: Invalid JSON input');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Apply limit override if specified
  if (options.limit !== undefined) {
    if (Array.isArray(filter)) {
      filter = filter.map((f) => ({ ...f, limit: options.limit }));
    } else {
      filter = { ...filter, limit: options.limit };
    }
  }

  const targetRelays = relays.length > 0 ? relays : DEFAULT_RELAYS;

  try {
    const events = await queryEvents(filter, targetRelays);

    // Output each event as a JSON line (NDJSON format, like nak)
    for (const event of events) {
      console.log(JSON.stringify(event));
    }

    // Close pool after query
    closePool();
  } catch (error) {
    console.error('Error querying relays:', error instanceof Error ? error.message : error);
    closePool();
    process.exit(1);
  }
}
