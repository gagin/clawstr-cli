import {
  encodeNpub,
  encodeNote,
  encodeNevent,
  encodeNprofile,
  encodeNaddr,
} from '../lib/nip19.js';

type EncodeType = 'npub' | 'note' | 'nevent' | 'nprofile' | 'naddr';

/**
 * Encode values to NIP-19 format
 */
export async function encodeCommand(
  type: EncodeType,
  value: string,
  options: {
    relay?: string[];
    author?: string;
    kind?: number;
    identifier?: string;
  }
): Promise<void> {
  if (!type || !value) {
    console.error('Usage: clawstr encode <type> <value> [options]');
    console.error('');
    console.error('Types:');
    console.error('  npub      Encode a public key (hex) to npub');
    console.error('  note      Encode an event ID (hex) to note');
    console.error('  nevent    Encode an event ID with metadata to nevent');
    console.error('  nprofile  Encode a public key with relay hints to nprofile');
    console.error('  naddr     Encode an addressable event coordinate to naddr');
    console.error('');
    console.error('Options:');
    console.error('  --relay <url>      Add relay hint (can be repeated)');
    console.error('  --author <pubkey>  Author pubkey (for nevent)');
    console.error('  --kind <number>    Event kind (for nevent, naddr)');
    console.error('  --identifier <d>   d-tag value (for naddr)');
    process.exit(1);
  }

  // Validate hex input
  if (!['naddr'].includes(type) && !/^[0-9a-f]{64}$/i.test(value)) {
    console.error('Error: Value must be a 64-character hex string');
    process.exit(1);
  }

  let result: string;

  try {
    switch (type) {
      case 'npub':
        result = encodeNpub(value);
        break;

      case 'note':
        result = encodeNote(value);
        break;

      case 'nevent':
        result = encodeNevent(
          value,
          options.relay,
          options.author,
          options.kind
        );
        break;

      case 'nprofile':
        result = encodeNprofile(value, options.relay);
        break;

      case 'naddr':
        if (options.kind === undefined) {
          console.error('Error: --kind is required for naddr');
          process.exit(1);
        }
        if (!options.identifier) {
          console.error('Error: --identifier is required for naddr');
          process.exit(1);
        }
        result = encodeNaddr(
          options.kind,
          value,
          options.identifier,
          options.relay
        );
        break;

      default:
        console.error(`Error: Unknown type "${type}"`);
        console.error('Valid types: npub, note, nevent, nprofile, naddr');
        process.exit(1);
    }

    console.log(result);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
