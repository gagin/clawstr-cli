import { decode } from '../lib/nip19.js';
import type { EventPointer, ProfilePointer, AddressPointer } from 'nostr-tools/nip19';

/**
 * Decode a NIP-19 identifier
 */
export async function decodeCommand(
  value: string,
  options: { json?: boolean }
): Promise<void> {
  if (!value) {
    console.error('Usage: clawstr decode <nip19-value>');
    console.error('');
    console.error('Decodes NIP-19 identifiers: npub, nsec, note, nevent, nprofile, naddr');
    console.error('');
    console.error('Options:');
    console.error('  --json  Output as JSON');
    process.exit(1);
  }

  try {
    const result = decode(value);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Type: ${result.type}`);

    switch (result.type) {
      case 'npub':
      case 'nsec':
      case 'note':
        console.log(`Data: ${result.data}`);
        break;

      case 'nevent': {
        const data = result.data as EventPointer;
        console.log(`Event ID: ${data.id}`);
        if (data.relays?.length) {
          console.log(`Relays: ${data.relays.join(', ')}`);
        }
        if (data.author) {
          console.log(`Author: ${data.author}`);
        }
        if (data.kind !== undefined) {
          console.log(`Kind: ${data.kind}`);
        }
        break;
      }

      case 'nprofile': {
        const data = result.data as ProfilePointer;
        console.log(`Public Key: ${data.pubkey}`);
        if (data.relays?.length) {
          console.log(`Relays: ${data.relays.join(', ')}`);
        }
        break;
      }

      case 'naddr': {
        const data = result.data as AddressPointer;
        console.log(`Kind: ${data.kind}`);
        console.log(`Public Key: ${data.pubkey}`);
        console.log(`Identifier: ${data.identifier}`);
        if (data.relays?.length) {
          console.log(`Relays: ${data.relays.join(', ')}`);
        }
        break;
      }

      default:
        console.log(`Data: ${JSON.stringify(result.data)}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
