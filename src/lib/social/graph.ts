import { getSocialDb } from './db.js';
import { getContacts } from './contacts.js';
import { isMuted } from './mutes.js';

/**
 * Update graph cache with a user's follows
 */
export function updateGraphCache(
  sourcePubkey: string,
  follows: string[],
  distance: number
): void {
  const db = getSocialDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO graph_cache (source_pubkey, target_pubkey, distance, updated_at)
    VALUES (?, ?, ?, strftime('%s', 'now'))
  `);

  const insertMany = db.transaction((follows: string[]) => {
    for (const targetPubkey of follows) {
      stmt.run(sourcePubkey, targetPubkey, distance);
    }
  });

  insertMany(follows);
}

/**
 * Get the trust distance to a pubkey
 * Returns null if not in graph
 */
export function getTrustDistance(targetPubkey: string, myPubkey: string): number | null {
  // Distance 0 = myself
  if (targetPubkey === myPubkey) {
    return 0;
  }

  // Distance 1 = direct follow
  const contacts = getContacts();
  const contactPubkeys = new Set(contacts.map((c) => c.pubkey));

  if (contactPubkeys.has(targetPubkey)) {
    return 1;
  }

  // Check graph cache for distance 2+
  const db = getSocialDb();
  const stmt = db.prepare(`
    SELECT MIN(distance) + 1 as distance
    FROM graph_cache
    WHERE source_pubkey IN (SELECT pubkey FROM contacts)
    AND target_pubkey = ?
  `);

  const result = stmt.get(targetPubkey) as { distance: number | null } | undefined;
  return result?.distance ?? null;
}

/**
 * Filter a list of pubkeys by max trust distance
 */
export function filterByTrustDistance(
  pubkeys: string[],
  myPubkey: string,
  maxDistance: number
): string[] {
  return pubkeys.filter((pubkey) => {
    // Always filter out muted users
    if (isMuted(pubkey)) {
      return false;
    }

    const distance = getTrustDistance(pubkey, myPubkey);

    // If not in graph and maxDistance is set, exclude
    if (distance === null) {
      return false;
    }

    return distance <= maxDistance;
  });
}

/**
 * Clear the graph cache
 */
export function clearGraphCache(): void {
  const db = getSocialDb();
  db.exec('DELETE FROM graph_cache');
}

/**
 * Get graph statistics
 */
export function getGraphStats(): {
  totalNodes: number;
  totalEdges: number;
  maxDistance: number;
} {
  const db = getSocialDb();

  const nodesStmt = db.prepare(`
    SELECT COUNT(DISTINCT target_pubkey) as count FROM graph_cache
  `);
  const edgesStmt = db.prepare(`
    SELECT COUNT(*) as count FROM graph_cache
  `);
  const maxDistStmt = db.prepare(`
    SELECT MAX(distance) as max FROM graph_cache
  `);

  const nodes = (nodesStmt.get() as { count: number }).count;
  const edges = (edgesStmt.get() as { count: number }).count;
  const maxDist = (maxDistStmt.get() as { max: number | null }).max ?? 0;

  return {
    totalNodes: nodes,
    totalEdges: edges,
    maxDistance: maxDist,
  };
}
