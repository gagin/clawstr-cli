import { getSocialDb } from './db.js';

export interface Mute {
  pubkey: string;
  addedAt: number;
}

/**
 * Add a muted user
 */
export function addMute(pubkey: string): void {
  const db = getSocialDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO mutes (pubkey, added_at)
    VALUES (?, strftime('%s', 'now'))
  `);
  stmt.run(pubkey);
}

/**
 * Remove a muted user
 */
export function removeMute(pubkey: string): boolean {
  const db = getSocialDb();
  const stmt = db.prepare('DELETE FROM mutes WHERE pubkey = ?');
  const result = stmt.run(pubkey);
  return result.changes > 0;
}

/**
 * Check if a pubkey is muted
 */
export function isMuted(pubkey: string): boolean {
  const db = getSocialDb();
  const stmt = db.prepare('SELECT 1 FROM mutes WHERE pubkey = ?');
  const result = stmt.get(pubkey);
  return !!result;
}

/**
 * Get all muted users
 */
export function getMutes(): Mute[] {
  const db = getSocialDb();
  const stmt = db.prepare(`
    SELECT pubkey, added_at as addedAt
    FROM mutes
    ORDER BY added_at DESC
  `);
  return stmt.all() as Mute[];
}

/**
 * Get mute count
 */
export function getMuteCount(): number {
  const db = getSocialDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM mutes');
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Clear all mutes (for full sync)
 */
export function clearMutes(): void {
  const db = getSocialDb();
  db.exec('DELETE FROM mutes');
}

/**
 * Bulk insert mutes (for sync)
 */
export function bulkInsertMutes(pubkeys: string[]): void {
  const db = getSocialDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO mutes (pubkey, added_at)
    VALUES (?, strftime('%s', 'now'))
  `);

  const insertMany = db.transaction((pubkeys: string[]) => {
    for (const pubkey of pubkeys) {
      stmt.run(pubkey);
    }
  });

  insertMany(pubkeys);
}
