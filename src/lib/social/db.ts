import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { PATHS } from '../../config.js';

// Social graph database path
export const SOCIAL_DB_PATH = `${PATHS.socialDir}/graph.db`;

let db: Database.Database | null = null;

/**
 * Initialize the social graph database
 */
export function initSocialDb(): Database.Database {
  if (db) return db;

  // Ensure directory exists
  const dir = dirname(SOCIAL_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  db = new Database(SOCIAL_DB_PATH);

  // Create tables
  db.exec(`
    -- Contacts (people we follow)
    CREATE TABLE IF NOT EXISTS contacts (
      pubkey TEXT PRIMARY KEY,
      relay TEXT,
      petname TEXT,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Muted users
    CREATE TABLE IF NOT EXISTS mutes (
      pubkey TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Social graph cache (for trust distance calculation)
    CREATE TABLE IF NOT EXISTS graph_cache (
      source_pubkey TEXT NOT NULL,
      target_pubkey TEXT NOT NULL,
      distance INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (source_pubkey, target_pubkey)
    );

    -- Metadata about sync state
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    -- Index for distance queries
    CREATE INDEX IF NOT EXISTS idx_graph_distance ON graph_cache(distance);
  `);

  return db;
}

/**
 * Close the database connection
 */
export function closeSocialDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get or initialize the database
 */
export function getSocialDb(): Database.Database {
  return initSocialDb();
}
