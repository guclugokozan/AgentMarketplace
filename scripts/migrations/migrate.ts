/**
 * Database Migration Runner
 *
 * Runs all pending SQL migrations in order.
 * Tracks applied migrations in a migrations table.
 */

import Database from 'better-sqlite3';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(dbPath: string = './data/agent-marketplace.db'): void {
  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable foreign keys and WAL mode
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r: any) => r.name)
  );

  // Get migration files
  const migrationsDir = __dirname;
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let migrationsRun = 0;

  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`Applying migration: ${file}`);

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
        migrationsRun++;
        console.log(`  ✓ Applied successfully`);
      } catch (error) {
        console.error(`  ✗ Failed to apply: ${error}`);
        db.close();
        throw error;
      }
    }
  }

  if (migrationsRun === 0) {
    console.log('No pending migrations');
  } else {
    console.log(`\nApplied ${migrationsRun} migration(s)`);
  }

  db.close();
}

export function rollbackMigration(dbPath: string = './data/agent-marketplace.db'): void {
  const db = new Database(dbPath);

  const lastMigration = db.prepare(
    'SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
  ).get() as { name: string } | undefined;

  if (!lastMigration) {
    console.log('No migrations to rollback');
    db.close();
    return;
  }

  console.log(`Rolling back: ${lastMigration.name}`);

  // Note: This doesn't actually undo the SQL - that would require down migrations
  db.prepare('DELETE FROM schema_migrations WHERE name = ?').run(lastMigration.name);
  console.log(`  ✓ Removed from migrations table (manual cleanup may be required)`);

  db.close();
}

export function getMigrationStatus(dbPath: string = './data/agent-marketplace.db'): {
  applied: string[];
  pending: string[];
} {
  if (!existsSync(dbPath)) {
    const files = readdirSync(__dirname).filter(f => f.endsWith('.sql')).sort();
    return { applied: [], pending: files };
  }

  const db = new Database(dbPath);

  let applied: string[] = [];
  try {
    applied = db.prepare('SELECT name FROM schema_migrations ORDER BY applied_at')
      .all()
      .map((r: any) => r.name);
  } catch {
    // Table doesn't exist
  }

  const appliedSet = new Set(applied);
  const allFiles = readdirSync(__dirname).filter(f => f.endsWith('.sql')).sort();
  const pending = allFiles.filter(f => !appliedSet.has(f));

  db.close();

  return { applied, pending };
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'run';

  switch (command) {
    case 'run':
      runMigrations();
      break;
    case 'rollback':
      rollbackMigration();
      break;
    case 'status':
      const status = getMigrationStatus();
      console.log('Applied migrations:');
      status.applied.forEach(m => console.log(`  ✓ ${m}`));
      console.log('\nPending migrations:');
      status.pending.forEach(m => console.log(`  ○ ${m}`));
      break;
    default:
      console.log('Usage: npx tsx migrate.ts [run|rollback|status]');
  }
}
