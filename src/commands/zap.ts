import { bech32 } from '@scure/base';
import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools/pure';

import { loadSecretKey, loadKeyPair } from '../lib/keys.js';
import { createSignedEvent } from '../lib/signer.js';
import { queryEvents, publishEvent } from '../lib/relays.js';
import { getManager, closeManager, forceExit } from '../lib/wallet/manager.js';
import { loadWalletConfig } from '../lib/wallet/config.js';
import { DEFAULT_RELAYS } from '../config.js';

interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

interface LnurlInvoiceResponse {
  pr: string; // payment request (bolt11 invoice)
  routes?: string[];
}

/**
 * Parse a Lightning address (user@domain) into an LNURL pay endpoint
 */
function lightningAddressToLnurl(address: string): string {
  const [name, domain] = address.split('@');
  if (!name || !domain) {
    throw new Error(`Invalid Lightning address: ${address}`);
  }
  return `https://${domain}/.well-known/lnurlp/${name}`;
}

/**
 * Encode a URL as lnurl (bech32 with prefix 'lnurl')
 */
function encodeLnurl(url: string): string {
  const data = new TextEncoder().encode(url);
  const words = bech32.toWords(data);
  return bech32.encode('lnurl', words, 1500);
}

/**
 * Resolve a pubkey from various formats (npub, hex, nprofile)
 */
function resolvePubkey(input: string): string {
  // Already hex
  if (/^[0-9a-f]{64}$/i.test(input)) {
    return input.toLowerCase();
  }

  // NIP-19 encoded
  if (input.startsWith('npub1') || input.startsWith('nprofile1')) {
    const decoded = nip19.decode(input);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    if (decoded.type === 'nprofile') {
      return decoded.data.pubkey;
    }
  }

  throw new Error(`Invalid pubkey format: ${input}`);
}

/**
 * Fetch user profile to get Lightning address (lud16)
 */
async function fetchLightningAddress(pubkey: string): Promise<string | null> {
  const events = await queryEvents(
    { kinds: [0], authors: [pubkey], limit: 1 },
    DEFAULT_RELAYS
  );

  if (events.length === 0) {
    return null;
  }

  try {
    const metadata = JSON.parse(events[0].content);
    return metadata.lud16 || null;
  } catch {
    return null;
  }
}

/**
 * Fetch LNURL pay endpoint info
 */
async function fetchLnurlPayInfo(lnurlEndpoint: string): Promise<LnurlPayResponse> {
  const response = await fetch(lnurlEndpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch LNURL pay info: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<LnurlPayResponse>;
}

/**
 * Request an invoice with a zap request
 */
async function requestZapInvoice(
  callback: string,
  amount: number,
  zapRequest: string,
  lnurl: string
): Promise<string> {
  const url = new URL(callback);
  url.searchParams.set('amount', amount.toString());
  url.searchParams.set('nostr', zapRequest);
  url.searchParams.set('lnurl', lnurl);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to request zap invoice: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as LnurlInvoiceResponse;
  if (!data.pr) {
    throw new Error('No invoice returned from LNURL callback');
  }

  return data.pr;
}

/**
 * Zap a user or event
 */
export async function zapCommand(
  recipient: string,
  amount: number,
  options: {
    comment?: string;
    event?: string;
    relays?: string[];
  }
): Promise<void> {
  // Validate amount
  if (!amount || amount <= 0) {
    console.error('Error: Amount must be a positive number (in sats)');
    process.exit(1);
  }

  // Check we have identity
  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('Error: No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  // Check wallet is initialized
  const walletConfig = loadWalletConfig();
  if (!walletConfig) {
    console.error('Error: Wallet not initialized. Run `clawstr wallet init` first.');
    process.exit(1);
  }

  try {
    // Step 1: Resolve recipient pubkey
    console.log('Resolving recipient...');
    const recipientPubkey = resolvePubkey(recipient);

    // Step 2: Get recipient's Lightning address
    console.log('Fetching Lightning address...');
    const lightningAddress = await fetchLightningAddress(recipientPubkey);
    if (!lightningAddress) {
      console.error('Error: Recipient has no Lightning address (lud16) in their profile');
      process.exit(1);
    }
    console.log(`  Found: ${lightningAddress}`);

    // Step 3: Fetch LNURL pay endpoint info
    console.log('Checking LNURL pay endpoint...');
    const lnurlEndpoint = lightningAddressToLnurl(lightningAddress);
    const lnurlInfo = await fetchLnurlPayInfo(lnurlEndpoint);

    // Verify Nostr zaps are supported
    if (!lnurlInfo.allowsNostr || !lnurlInfo.nostrPubkey) {
      console.error('Error: Recipient\'s Lightning address does not support Nostr zaps');
      console.error('  You can still pay their Lightning address directly with:');
      console.error(`  clawstr wallet send bolt11 <invoice>`);
      process.exit(1);
    }

    // Convert amount to millisats and validate
    const amountMsats = amount * 1000;
    if (amountMsats < lnurlInfo.minSendable) {
      console.error(`Error: Amount too small. Minimum: ${Math.ceil(lnurlInfo.minSendable / 1000)} sats`);
      process.exit(1);
    }
    if (amountMsats > lnurlInfo.maxSendable) {
      console.error(`Error: Amount too large. Maximum: ${Math.floor(lnurlInfo.maxSendable / 1000)} sats`);
      process.exit(1);
    }

    // Step 4: Create zap request event (kind 9734)
    console.log('Creating zap request...');
    const relays = options.relays || DEFAULT_RELAYS;
    const lnurl = encodeLnurl(lnurlEndpoint);

    const tags: string[][] = [
      ['relays', ...relays],
      ['amount', amountMsats.toString()],
      ['lnurl', lnurl],
      ['p', recipientPubkey],
    ];

    // Add event tag if zapping an event
    if (options.event) {
      let eventId = options.event;
      // Decode if NIP-19 format
      if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
        const decoded = nip19.decode(eventId);
        if (decoded.type === 'note') {
          eventId = decoded.data;
        } else if (decoded.type === 'nevent') {
          eventId = decoded.data.id;
        }
      }
      tags.push(['e', eventId]);
    }

    const zapRequest = createSignedEvent(
      9734,
      options.comment || '',
      tags
    );

    // Step 5: Request invoice from LNURL endpoint
    console.log('Requesting invoice...');
    const invoice = await requestZapInvoice(
      lnurlInfo.callback,
      amountMsats,
      JSON.stringify(zapRequest),
      lnurl
    );

    // Step 6: Pay the invoice
    console.log(`Paying ${amount} sats...`);
    const manager = await getManager();
    const mintUrl = walletConfig.mintUrl;

    // Prepare melt (get quote)
    const prepared = await manager.quotes.prepareMeltBolt11(mintUrl, invoice);
    console.log(`  Amount: ${prepared.amount} sats + ${prepared.fee_reserve} sats fee reserve`);

    // Execute melt (pay invoice)
    await manager.quotes.executeMelt(prepared.id);

    console.log('\nZap sent successfully!');
    console.log(`  Recipient: ${lightningAddress}`);
    console.log(`  Amount: ${amount} sats`);
    if (options.comment) {
      console.log(`  Comment: ${options.comment}`);
    }

    // Show remaining balance
    const balances = await manager.wallet.getBalances();
    const total = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
    console.log(`\nRemaining balance: ${total} sats`);

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}
