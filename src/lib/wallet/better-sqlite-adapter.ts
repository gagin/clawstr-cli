/**
 * Adapter to make better-sqlite3 compatible with coco-cashu's DatabaseLike interface.
 * 
 * better-sqlite3 uses a synchronous API, while the DatabaseLike interface expects
 * callback-based async methods. This adapter bridges the gap.
 */

import Database from 'better-sqlite3';

/**
 * Interface expected by coco-cashu-sqlite3
 */
interface DatabaseLike {
  exec(sql: string, cb: (err: Error | null) => void): void;
  run(sql: string, params: any[], cb: (this: {
    lastID: number;
    changes: number;
  }, err: Error | null) => void): void;
  get(sql: string, params: any[], cb: (err: Error | null, row: any) => void): void;
  all(sql: string, params: any[], cb: (err: Error | null, rows: any[]) => void): void;
  close(cb: (err: Error | null) => void): void;
}

/**
 * Adapter that wraps better-sqlite3 Database to implement the DatabaseLike interface
 */
export class BetterSqliteAdapter implements DatabaseLike {
  constructor(private db: Database.Database) {}

  /**
   * Fixes SQL queries from coco-cashu-sqlite3 that use double quotes for string literals.
   * SQLite expects single quotes for string literals, and double quotes for identifiers.
   */
  private fixSql(sql: string): string {
    return sql
      .replace(/=\s*"ready"/g, "= 'ready'")
      .replace(/=\s*"inflight"/g, "= 'inflight'");
  }

  exec(sql: string, cb: (err: Error | null) => void): void {
    try {
      this.db.exec(this.fixSql(sql));
      cb(null);
    } catch (err) {
      cb(err as Error);
    }
  }

  run(
    sql: string,
    params: any[],
    cb: (this: { lastID: number; changes: number }, err: Error | null) => void
  ): void {
    try {
      const result = this.db.prepare(this.fixSql(sql)).run(...params);
      const context = {
        lastID: Number(result.lastInsertRowid),
        changes: result.changes,
      };
      cb.call(context, null);
    } catch (err) {
      cb.call({ lastID: 0, changes: 0 }, err as Error);
    }
  }

  get(sql: string, params: any[], cb: (err: Error | null, row: any) => void): void {
    try {
      const row = this.db.prepare(this.fixSql(sql)).get(...params);
      cb(null, row);
    } catch (err) {
      cb(err as Error, undefined);
    }
  }

  all(sql: string, params: any[], cb: (err: Error | null, rows: any[]) => void): void {
    try {
      const rows = this.db.prepare(this.fixSql(sql)).all(...params);
      cb(null, rows);
    } catch (err) {
      cb(err as Error, []);
    }
  }

  close(cb: (err: Error | null) => void): void {
    try {
      this.db.close();
      cb(null);
    } catch (err) {
      cb(err as Error);
    }
  }

  /**
   * Get the underlying better-sqlite3 Database instance
   */
  get raw(): Database.Database {
    return this.db;
  }
}

/**
 * Create a new DatabaseLike adapter from a better-sqlite3 Database
 */
export function createDatabaseAdapter(db: Database.Database): DatabaseLike {
  return new BetterSqliteAdapter(db);
}
