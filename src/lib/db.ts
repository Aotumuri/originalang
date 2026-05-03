import { appDataDir, join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { APP_DB_NAME, INITIAL_CATEGORIES, INITIAL_PARTS_OF_SPEECH } from "../constants";
import { nowIsoString, toSqliteUrl } from "./utils";

let databasePromise: Promise<Database> | null = null;
let databaseTaskQueue: Promise<void> = Promise.resolve();

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS parts_of_speech (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    pronunciation TEXT,
    japanese TEXT,
    meaning TEXT,
    etymology TEXT,
    origin TEXT,
    notes TEXT,
    part_of_speech_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (part_of_speech_id) REFERENCES parts_of_speech(id)
  )`,
  `CREATE TABLE IF NOT EXISTS word_categories (
    word_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (word_id, category_id),
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS examples (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL,
    text TEXT NOT NULL,
    translation TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS word_components (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL,
    text TEXT NOT NULL,
    meaning TEXT,
    linked_word_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_word_id) REFERENCES words(id) ON DELETE SET NULL
  )`,
];

async function seedInitialData(db: Database): Promise<void> {
  const timestamp = nowIsoString();

  for (const item of INITIAL_PARTS_OF_SPEECH) {
    await db.execute(
      `INSERT OR IGNORE INTO parts_of_speech (id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [item.id, item.name, item.description, timestamp, timestamp],
    );
  }

  for (const item of INITIAL_CATEGORIES) {
    await db.execute(
      `INSERT OR IGNORE INTO categories (id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [item.id, item.name, item.description, timestamp, timestamp],
    );
  }
}

async function initializeDatabase(db: Database): Promise<void> {
  await db.execute("PRAGMA foreign_keys = ON");
  await db.execute("PRAGMA journal_mode = WAL");
  await db.execute("PRAGMA synchronous = NORMAL");
  await db.execute("PRAGMA busy_timeout = 5000");

  for (const statement of SCHEMA_STATEMENTS) {
    await db.execute(statement);
  }

  await seedInitialData(db);
}

export async function getDatabasePath(): Promise<string> {
  return join(await appDataDir(), APP_DB_NAME);
}

export async function getDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const dbPath = await getDatabasePath();
      const db = await Database.load(toSqliteUrl(dbPath));
      await initializeDatabase(db);
      return db;
    })();
  }

  return databasePromise;
}

export async function withDatabase<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const task = databaseTaskQueue.then(
    async () => work(await getDatabase()),
    async () => work(await getDatabase()),
  );

  databaseTaskQueue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}
