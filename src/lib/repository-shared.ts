import type Database from "@tauri-apps/plugin-sql";
import type {
  DictionaryExport,
  ExportManagedEntity,
  ManagedEntity,
  WordComponentRecord,
  WordListItem,
  WordRecord,
} from "../types";
import { withDatabase } from "./db";
import { createId, nowIsoString, toOptionalString } from "./utils";

export type DbManagedRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
};

export type DbWordRow = {
  id: string;
  text: string;
  pronunciation: string | null;
  japanese: string | null;
  meaning: string | null;
  etymology: string | null;
  origin: string | null;
  notes: string | null;
  part_of_speech_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DbWordCategoryRow = {
  word_id: string;
  category_id: string;
  category_name: string;
};

export type DbExampleRow = {
  id: string;
  word_id: string;
  text: string;
  translation: string | null;
  note: string | null;
  sort_order: number;
};

export type DbComponentRow = {
  id: string;
  word_id: string;
  text: string;
  meaning: string | null;
  linked_word_id: string | null;
  sort_order: number;
};

export type DbWordListRow = {
  id: string;
  text: string;
  pronunciation: string | null;
  japanese: string | null;
  part_of_speech_id: string | null;
  part_of_speech_name: string | null;
  category_names: string | null;
  updated_at: string;
};

export type DbWordReferenceRow = {
  id: string;
  text: string;
  japanese: string | null;
};

export type DbDuplicateRow = {
  id: string;
  text: string;
  japanese: string | null;
  pronunciation: string | null;
  updated_at: string;
};

export function mapManagedEntity(row: DbManagedRow): ManagedEntity {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: Number(row.usage_count ?? 0),
  };
}

export function mapWordListRow(row: DbWordListRow): WordListItem {
  return {
    id: row.id,
    text: row.text,
    pronunciation: row.pronunciation ?? "",
    japanese: row.japanese ?? "",
    partOfSpeechId: row.part_of_speech_id,
    partOfSpeechName: row.part_of_speech_name ?? "",
    categoryNames: row.category_names ? row.category_names.split(",").filter(Boolean) : [],
    updatedAt: row.updated_at,
  };
}

export function mapWordRecord(
  row: DbWordRow,
  partOfSpeechName: string,
  categoryIds: string[],
  categoryNames: string[],
  examples: WordRecord["examples"],
  components: WordRecord["components"],
): WordRecord {
  return {
    id: row.id,
    text: row.text,
    pronunciation: row.pronunciation ?? "",
    japanese: row.japanese ?? "",
    meaning: row.meaning ?? "",
    etymology: row.etymology ?? "",
    origin: row.origin ?? "",
    notes: row.notes ?? "",
    partOfSpeechId: row.part_of_speech_id,
    partOfSpeechName,
    categoryIds,
    categoryNames,
    examples,
    components,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeExamples(wordId: string, examples: WordRecord["examples"]) {
  return examples
    .map((example, index) => ({
      id: example.id || createId("example"),
      wordId,
      text: example.text.trim(),
      translation: toOptionalString(example.translation),
      note: toOptionalString(example.note),
      sortOrder: index,
    }))
    .filter((example) => example.text.length > 0);
}

export function normalizeComponents(
  wordId: string,
  components: WordComponentRecord[],
): WordComponentRecord[] {
  return components
    .map((component, index) => ({
      id: component.id || createId("component"),
      wordId,
      text: component.text.trim(),
      meaning: toOptionalString(component.meaning),
      linkedWordId: component.linkedWordId || null,
      sortOrder: index,
    }))
    .filter((component) => component.text.length > 0);
}

export async function runTransaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
  return withDatabase(async (db) => {
    await db.execute("BEGIN IMMEDIATE");

    try {
      const result = await work(db);
      await db.execute("COMMIT");
      return result;
    } catch (error) {
      try {
        await db.execute("ROLLBACK");
      } catch {
        // Ignore rollback errors and bubble the original one.
      }
      throw error;
    }
  });
}

export function assertDictionaryImport(value: unknown): asserts value is DictionaryExport {
  if (typeof value !== "object" || value === null) {
    throw new Error("JSON の形式が不正です。");
  }

  const candidate = value as Partial<DictionaryExport>;
  if (typeof candidate.version !== "number") {
    throw new Error("JSON に version がありません。");
  }
  if (!Array.isArray(candidate.words)) {
    throw new Error("JSON の words が配列ではありません。");
  }
  if (!Array.isArray(candidate.partsOfSpeech)) {
    throw new Error("JSON の partsOfSpeech が配列ではありません。");
  }
  if (!Array.isArray(candidate.categories)) {
    throw new Error("JSON の categories が配列ではありません。");
  }
}

export function getPersistedManagedEntity(
  entity: Pick<ManagedEntity, "id" | "name" | "description">,
  existing?: ManagedEntity,
): ExportManagedEntity {
  const timestamp = nowIsoString();
  return {
    id: entity.id,
    name: entity.name.trim(),
    description: entity.description.trim() || undefined,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}
