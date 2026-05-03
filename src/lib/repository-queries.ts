import type {
  DictionarySnapshot,
  ManagedEntity,
  SearchFilters,
  WordReference,
  WordListItem,
  WordRecord,
} from "../types";
import { getDatabase } from "./db";
import {
  DbComponentRow,
  DbDuplicateRow,
  DbExampleRow,
  DbManagedRow,
  DbWordCategoryRow,
  DbWordListRow,
  DbWordReferenceRow,
  DbWordRow,
  mapManagedEntity,
  mapWordListRow,
  mapWordRecord,
} from "./repository-shared";

export async function listWords(filters: SearchFilters): Promise<WordListItem[]> {
  const db = await getDatabase();
  const queryText = filters.query.trim();
  const rows = await db.select<DbWordListRow[]>(
    `SELECT
      w.id,
      w.text,
      w.pronunciation,
      w.japanese,
      w.part_of_speech_id,
      p.name AS part_of_speech_name,
      GROUP_CONCAT(DISTINCT c.name) AS category_names,
      w.updated_at
    FROM words w
    LEFT JOIN parts_of_speech p ON p.id = w.part_of_speech_id
    LEFT JOIN word_categories wc ON wc.word_id = w.id
    LEFT JOIN categories c ON c.id = wc.category_id
    WHERE
      ($1 = '' OR
        w.text LIKE '%' || $1 || '%' OR
        COALESCE(w.pronunciation, '') LIKE '%' || $1 || '%' OR
        COALESCE(w.japanese, '') LIKE '%' || $1 || '%' OR
        COALESCE(w.meaning, '') LIKE '%' || $1 || '%' OR
        COALESCE(w.etymology, '') LIKE '%' || $1 || '%' OR
        COALESCE(w.origin, '') LIKE '%' || $1 || '%' OR
        COALESCE(w.notes, '') LIKE '%' || $1 || '%'
      )
      AND ($2 = '' OR COALESCE(w.part_of_speech_id, '') = $2)
      AND (
        $3 = '' OR EXISTS (
          SELECT 1
          FROM word_categories filtered_wc
          WHERE filtered_wc.word_id = w.id
            AND filtered_wc.category_id = $3
        )
      )
    GROUP BY w.id, p.name
    ORDER BY w.updated_at DESC, w.text ASC`,
    [queryText, filters.partOfSpeechId, filters.categoryId],
  );

  return rows.map(mapWordListRow);
}

export async function getWord(wordId: string): Promise<WordRecord | null> {
  const snapshot = await getDictionarySnapshot();
  return snapshot.words.find((word) => word.id === wordId) ?? null;
}

export async function listAllWordReferences(): Promise<WordReference[]> {
  const db = await getDatabase();
  const rows = await db.select<DbWordReferenceRow[]>(
    `SELECT id, text, japanese
     FROM words
     ORDER BY text ASC, updated_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    japanese: row.japanese ?? "",
  }));
}

export async function findDuplicateWords(
  text: string,
  excludeWordId?: string,
): Promise<WordListItem[]> {
  const candidate = text.trim();
  if (!candidate) {
    return [];
  }

  const db = await getDatabase();
  const rows = await db.select<DbDuplicateRow[]>(
    `SELECT id, text, japanese, pronunciation, updated_at
     FROM words
     WHERE text = $1
       AND ($2 = '' OR id <> $2)
     ORDER BY updated_at DESC`,
    [candidate, excludeWordId ?? ""],
  );

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    pronunciation: row.pronunciation ?? "",
    japanese: row.japanese ?? "",
    partOfSpeechId: null,
    partOfSpeechName: "",
    categoryNames: [],
    updatedAt: row.updated_at,
  }));
}

export async function listPartsOfSpeech(): Promise<ManagedEntity[]> {
  const db = await getDatabase();
  const rows = await db.select<DbManagedRow[]>(
    `SELECT
      p.id,
      p.name,
      p.description,
      p.created_at,
      p.updated_at,
      COUNT(w.id) AS usage_count
    FROM parts_of_speech p
    LEFT JOIN words w ON w.part_of_speech_id = p.id
    GROUP BY p.id, p.name, p.description, p.created_at, p.updated_at
    ORDER BY p.name ASC`,
  );

  return rows.map(mapManagedEntity);
}

export async function listCategories(): Promise<ManagedEntity[]> {
  const db = await getDatabase();
  const rows = await db.select<DbManagedRow[]>(
    `SELECT
      c.id,
      c.name,
      c.description,
      c.created_at,
      c.updated_at,
      COUNT(wc.word_id) AS usage_count
    FROM categories c
    LEFT JOIN word_categories wc ON wc.category_id = c.id
    GROUP BY c.id, c.name, c.description, c.created_at, c.updated_at
    ORDER BY c.name ASC`,
  );

  return rows.map(mapManagedEntity);
}

export async function getDictionarySnapshot(): Promise<DictionarySnapshot> {
  const db = await getDatabase();
  const [partsOfSpeech, categories, words, wordCategories, examples, components] = await Promise.all([
    listPartsOfSpeech(),
    listCategories(),
    db.select<DbWordRow[]>(`SELECT * FROM words ORDER BY updated_at DESC, text ASC`),
    db.select<DbWordCategoryRow[]>(
      `SELECT wc.word_id, wc.category_id, c.name AS category_name
       FROM word_categories wc
       JOIN categories c ON c.id = wc.category_id
       ORDER BY c.name ASC`,
    ),
    db.select<DbExampleRow[]>(
      `SELECT id, word_id, text, translation, note, sort_order
       FROM examples
       ORDER BY word_id ASC, sort_order ASC`,
    ),
    db.select<DbComponentRow[]>(
      `SELECT id, word_id, text, meaning, linked_word_id, sort_order
       FROM word_components
       ORDER BY word_id ASC, sort_order ASC`,
    ),
  ]);

  const posMap = new Map(partsOfSpeech.map((item) => [item.id, item.name]));
  const categoryRowsByWord = new Map<string, DbWordCategoryRow[]>();
  const examplesByWord = new Map<string, WordRecord["examples"]>();
  const componentsByWord = new Map<string, WordRecord["components"]>();

  for (const row of wordCategories) {
    const list = categoryRowsByWord.get(row.word_id) ?? [];
    list.push(row);
    categoryRowsByWord.set(row.word_id, list);
  }

  for (const row of examples) {
    const list = examplesByWord.get(row.word_id) ?? [];
    list.push({
      id: row.id,
      wordId: row.word_id,
      text: row.text,
      translation: row.translation ?? "",
      note: row.note ?? "",
      sortOrder: row.sort_order,
    });
    examplesByWord.set(row.word_id, list);
  }

  for (const row of components) {
    const list = componentsByWord.get(row.word_id) ?? [];
    list.push({
      id: row.id,
      wordId: row.word_id,
      text: row.text,
      meaning: row.meaning ?? "",
      linkedWordId: row.linked_word_id,
      sortOrder: row.sort_order,
    });
    componentsByWord.set(row.word_id, list);
  }

  return {
    words: words.map((row) => {
      const categoryRows = categoryRowsByWord.get(row.id) ?? [];
      return mapWordRecord(
        row,
        row.part_of_speech_id ? posMap.get(row.part_of_speech_id) ?? "" : "",
        categoryRows.map((category) => category.category_id),
        categoryRows.map((category) => category.category_name),
        examplesByWord.get(row.id) ?? [],
        componentsByWord.get(row.id) ?? [],
      );
    }),
    partsOfSpeech,
    categories,
  };
}
