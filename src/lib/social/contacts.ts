import { getSocialDb } from './db.js';

export interface Contact {
  pubkey: string;
  relay?: string;
  petname?: string;
  addedAt: number;
}

/**
 * Add a contact (follow)
 */
export function addContact(pubkey: string, relay?: string, petname?: string): void {
  const db = getSocialDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contacts (pubkey, relay, petname, added_at)
    VALUES (?, ?, ?, strftime('%s', 'now'))
  `);
  stmt.run(pubkey, relay || null, petname || null);
}

/**
 * Remove a contact (unfollow)
 */
export function removeContact(pubkey: string): boolean {
  const db = getSocialDb();
  const stmt = db.prepare('DELETE FROM contacts WHERE pubkey = ?');
  const result = stmt.run(pubkey);
  return result.changes > 0;
}

/**
 * Check if a pubkey is in contacts
 */
export function isContact(pubkey: string): boolean {
  const db = getSocialDb();
  const stmt = db.prepare('SELECT 1 FROM contacts WHERE pubkey = ?');
  const result = stmt.get(pubkey);
  return !!result;
}

/**
 * Get all contacts
 */
export function getContacts(): Contact[] {
  const db = getSocialDb();
  const stmt = db.prepare(`
    SELECT pubkey, relay, petname, added_at as addedAt
    FROM contacts
    ORDER BY added_at DESC
  `);
  return stmt.all() as Contact[];
}

/**
 * Get contact count
 */
export function getContactCount(): number {
  const db = getSocialDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM contacts');
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Clear all contacts (for full sync)
 */
export function clearContacts(): void {
  const db = getSocialDb();
  db.exec('DELETE FROM contacts');
}

/**
 * Bulk insert contacts (for sync)
 */
export function bulkInsertContacts(contacts: Array<{ pubkey: string; relay?: string; petname?: string }>): void {
  const db = getSocialDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contacts (pubkey, relay, petname, added_at)
    VALUES (?, ?, ?, strftime('%s', 'now'))
  `);

  const insertMany = db.transaction((contacts: Array<{ pubkey: string; relay?: string; petname?: string }>) => {
    for (const contact of contacts) {
      stmt.run(contact.pubkey, contact.relay || null, contact.petname || null);
    }
  });

  insertMany(contacts);
}
