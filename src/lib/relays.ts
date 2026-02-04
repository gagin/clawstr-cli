import 'websocket-polyfill';
import { SimplePool, type VerifiedEvent, type Filter } from 'nostr-tools';
import { DEFAULT_RELAYS } from '../config.js';

// Global pool instance
let pool: SimplePool | null = null;

/**
 * Get or create the relay pool
 */
export function getPool(): SimplePool {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

/**
 * Publish an event to relays
 * Returns array of relay URLs that accepted the event
 */
export async function publishEvent(
  event: VerifiedEvent,
  relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const pool = getPool();
  const results: string[] = [];

  const promises = pool.publish(relays, event);

  // Wait for all publish attempts
  const settled = await Promise.allSettled(promises);

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      results.push(relays[i]);
    }
  });

  return results;
}

/**
 * Query events from relays
 */
export async function queryEvents(
  filter: Filter | Filter[],
  relays: string[] = DEFAULT_RELAYS
): Promise<VerifiedEvent[]> {
  const pool = getPool();
  const filters = Array.isArray(filter) ? filter : [filter];

  // querySync expects individual filters, so we query each and merge
  const allEvents: VerifiedEvent[] = [];
  for (const f of filters) {
    const events = await pool.querySync(relays, f);
    allEvents.push(...(events as VerifiedEvent[]));
  }
  return allEvents;
}

/**
 * Query a single event by ID
 */
export async function queryEventById(
  id: string,
  relays: string[] = DEFAULT_RELAYS
): Promise<VerifiedEvent | null> {
  const events = await queryEvents({ ids: [id] }, relays);
  return events[0] || null;
}

/**
 * Close the pool and all connections
 */
export function closePool(): void {
  if (pool) {
    pool.close(DEFAULT_RELAYS);
    pool = null;
  }
}
