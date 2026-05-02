import type Database from "@tauri-apps/plugin-sql";
import { EXPORT_VERSION } from "../constants";
import type {
  DictionaryExport,
  DictionarySnapshot,
  ExportManagedEntity,
  ExportWord,
  ManagedEntity,
  SearchFilters,
  WordComponentRecord,
  WordListItem,
  WordRecord,
} from "../types";
import { getDatabase } from "./db";
import { createId, nowIsoString, toOptionalString } from "./utils";

type DbManagedRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
};

type DbWordRow = {
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

type DbWordCategoryRow = {
  word_id: string;
  category_id: string;
  category_name: string;
};

type DbExampleRow = {
  id: string;
  word_id: string;
  text: string;
  translation: string | null;
  note: string | null;
  sort_order: number;
};

type DbComponentRow = {
  id: string;
  word_id: string;
  text: string;
  meaning: string | null;
  linked_word_id: string | null;
  sort_order: number;
};

type DbWordListRow = {
  id: string;
  text: string;
  pronunciation: string | null;
  japanese: string | null;
  part_of_speech_id: string | null;
  part_of_speech_name: string | null;
  category_names: string | null;
  updated_at: string;
};

type DbDuplicateRow = {
  id: string;
  text: string;
  japanese: string | null;
  pronunciation: string | null;
  updated_at: string;
};

function mapManagedEntity(row: DbManagedRow): ManagedEntity {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: Number(row.usage_count ?? 0),
  };
}

function mapWordListRow(row: DbWordListRow): WordListItem {
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

function mapWordRecord(
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

function normalizeExamples(wordId: string, examples: WordRecord["examples"]) {
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

function extractComponents(wordId: string, etymology: string): WordComponentRecord[] {
  return etymology
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: createId("component"),
      wordId,
      text,
      meaning: "",
      linkedWordId: null,
      sortOrder: index,
    }));
}

async function runTransaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  await db.execute("BEGIN");

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
}

function assertDictionaryImport(value: unknown): asserts value is DictionaryExport {
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

function getPersistedManagedEntity(
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

export async function savePartOfSpeech(
  entity: Pick<ManagedEntity, "id" | "name" | "description">,
): Promise<void> {
  const existing = (await listPartsOfSpeech()).find((item) => item.id === entity.id);
  const payload = getPersistedManagedEntity(entity, existing);

  await runTransaction(async (db) => {
    if (existing) {
      await db.execute(
        `UPDATE parts_of_speech
         SET name = $1, description = $2, updated_at = $3
         WHERE id = $4`,
        [payload.name, payload.description ?? "", payload.updatedAt, payload.id],
      );
      return;
    }

    await db.execute(
      `INSERT INTO parts_of_speech (id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.id, payload.name, payload.description ?? "", payload.createdAt, payload.updatedAt],
    );
  });
}

export async function deletePartOfSpeech(partOfSpeechId: string): Promise<void> {
  await runTransaction(async (db) => {
    await db.execute(`DELETE FROM parts_of_speech WHERE id = $1`, [partOfSpeechId]);
  });
}

export async function saveCategory(
  entity: Pick<ManagedEntity, "id" | "name" | "description">,
): Promise<void> {
  const existing = (await listCategories()).find((item) => item.id === entity.id);
  const payload = getPersistedManagedEntity(entity, existing);

  await runTransaction(async (db) => {
    if (existing) {
      await db.execute(
        `UPDATE categories
         SET name = $1, description = $2, updated_at = $3
         WHERE id = $4`,
        [payload.name, payload.description ?? "", payload.updatedAt, payload.id],
      );
      return;
    }

    await db.execute(
      `INSERT INTO categories (id, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.id, payload.name, payload.description ?? "", payload.createdAt, payload.updatedAt],
    );
  });
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await runTransaction(async (db) => {
    await db.execute(`DELETE FROM categories WHERE id = $1`, [categoryId]);
  });
}

export async function saveWord(word: WordRecord): Promise<WordRecord> {
  const text = word.text.trim();
  if (!text) {
    throw new Error("言語表記は必須です。");
  }

  const timestamp = nowIsoString();
  const examples = normalizeExamples(word.id, word.examples);
  const components = extractComponents(word.id, word.etymology);

  const normalized: WordRecord = {
    ...word,
    text,
    pronunciation: toOptionalString(word.pronunciation),
    japanese: toOptionalString(word.japanese),
    meaning: toOptionalString(word.meaning),
    etymology: toOptionalString(word.etymology),
    origin: toOptionalString(word.origin),
    notes: toOptionalString(word.notes),
    partOfSpeechId: word.partOfSpeechId || null,
    categoryIds: [...new Set(word.categoryIds)],
    examples,
    components,
    updatedAt: timestamp,
  };

  await runTransaction(async (db) => {
    await db.execute(
      `INSERT INTO words (
        id,
        text,
        pronunciation,
        japanese,
        meaning,
        etymology,
        origin,
        notes,
        part_of_speech_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        pronunciation = excluded.pronunciation,
        japanese = excluded.japanese,
        meaning = excluded.meaning,
        etymology = excluded.etymology,
        origin = excluded.origin,
        notes = excluded.notes,
        part_of_speech_id = excluded.part_of_speech_id,
        updated_at = excluded.updated_at`,
      [
        normalized.id,
        normalized.text,
        normalized.pronunciation,
        normalized.japanese,
        normalized.meaning,
        normalized.etymology,
        normalized.origin,
        normalized.notes,
        normalized.partOfSpeechId,
        normalized.createdAt,
        normalized.updatedAt,
      ],
    );

    await db.execute(`DELETE FROM word_categories WHERE word_id = $1`, [normalized.id]);
    await db.execute(`DELETE FROM examples WHERE word_id = $1`, [normalized.id]);
    await db.execute(`DELETE FROM word_components WHERE word_id = $1`, [normalized.id]);

    for (const categoryId of normalized.categoryIds) {
      await db.execute(
        `INSERT INTO word_categories (word_id, category_id) VALUES ($1, $2)`,
        [normalized.id, categoryId],
      );
    }

    for (const example of examples) {
      await db.execute(
        `INSERT INTO examples (id, word_id, text, translation, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          example.id,
          normalized.id,
          example.text,
          example.translation,
          example.note,
          example.sortOrder,
        ],
      );
    }

    for (const component of components) {
      await db.execute(
        `INSERT INTO word_components (id, word_id, text, meaning, linked_word_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          component.id,
          normalized.id,
          component.text,
          component.meaning,
          component.linkedWordId,
          component.sortOrder,
        ],
      );
    }
  });

  return normalized;
}

export async function deleteWord(wordId: string): Promise<void> {
  await runTransaction(async (db) => {
    await db.execute(`DELETE FROM words WHERE id = $1`, [wordId]);
  });
}

export async function resetDictionary(): Promise<void> {
  await runTransaction(async (db) => {
    await db.execute(`DELETE FROM word_components`);
    await db.execute(`DELETE FROM examples`);
    await db.execute(`DELETE FROM word_categories`);
    await db.execute(`DELETE FROM words`);
    await db.execute(`DELETE FROM categories`);
    await db.execute(`DELETE FROM parts_of_speech`);

    const timestamp = nowIsoString();

    for (const item of [
      { id: "pos-noun", name: "名詞", description: "もの・概念・場所・存在を表す品詞" },
      { id: "pos-verb", name: "動詞", description: "動作・変化・状態を表す品詞" },
      { id: "pos-adjective", name: "形容詞", description: "性質や状態を表す品詞" },
      { id: "pos-adverb", name: "副詞", description: "動詞や形容詞などを補足する品詞" },
      { id: "pos-particle", name: "結語詞", description: "文法関係や機能を示す品詞" },
      { id: "pos-prefix", name: "接頭辞", description: "語の前に付いて意味を補う要素" },
      { id: "pos-suffix", name: "接尾辞", description: "語の後に付いて意味を補う要素" },
      { id: "pos-root", name: "語根", description: "語の中心となる基本要素" },
      { id: "pos-proper-noun", name: "固有名詞", description: "人名・地名・国家名など固有の名称" },
    ]) {
      await db.execute(
        `INSERT INTO parts_of_speech (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.name, item.description, timestamp, timestamp],
      );
    }

    for (const item of [
      { id: "cat-grammar", name: "文法", description: "文法要素・語順・助詞的要素に関する単語" },
      { id: "cat-daily", name: "日常", description: "挨拶や日常会話に関する単語" },
      {
        id: "cat-state-politics",
        name: "国家・政治",
        description: "国家、政治体制、統治、戦争、外交に関する単語",
      },
      { id: "cat-magic", name: "魔法", description: "魔法や儀式、超常的な力に関する単語" },
      { id: "cat-color", name: "色", description: "色彩や光の表現に関する単語" },
      { id: "cat-person", name: "人", description: "人、役職、人物像に関する単語" },
      { id: "cat-movement", name: "移動", description: "移動、方向、到達に関する単語" },
    ]) {
      await db.execute(
        `INSERT INTO categories (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.name, item.description, timestamp, timestamp],
      );
    }
  });
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

  const detailedWords = words.map((row) => {
    const categoryRows = categoryRowsByWord.get(row.id) ?? [];
    const wordExamples = examplesByWord.get(row.id) ?? [];
    const wordComponents = componentsByWord.get(row.id) ?? [];
    return mapWordRecord(
      row,
      row.part_of_speech_id ? posMap.get(row.part_of_speech_id) ?? "" : "",
      categoryRows.map((category) => category.category_id),
      categoryRows.map((category) => category.category_name),
      wordExamples,
      wordComponents,
    );
  });

  return {
    words: detailedWords,
    partsOfSpeech,
    categories,
  };
}

export async function getDictionaryExport(): Promise<DictionaryExport> {
  const snapshot = await getDictionarySnapshot();
  return {
    version: EXPORT_VERSION,
    exportedAt: nowIsoString(),
    words: snapshot.words.map<ExportWord>((word) => ({
      id: word.id,
      text: word.text,
      pronunciation: word.pronunciation || undefined,
      japanese: word.japanese || undefined,
      meaning: word.meaning || undefined,
      etymology: word.etymology || undefined,
      origin: word.origin || undefined,
      notes: word.notes || undefined,
      partOfSpeechId: word.partOfSpeechId ?? undefined,
      categoryIds: word.categoryIds,
      examples: word.examples.map((example) => ({
        id: example.id,
        wordId: example.wordId,
        text: example.text,
        translation: example.translation || undefined,
        note: example.note || undefined,
        sortOrder: example.sortOrder,
      })),
      components: word.components.map((component) => ({
        id: component.id,
        wordId: component.wordId,
        text: component.text,
        meaning: component.meaning || undefined,
        linkedWordId: component.linkedWordId ?? undefined,
        sortOrder: component.sortOrder,
      })),
      createdAt: word.createdAt,
      updatedAt: word.updatedAt,
    })),
    partsOfSpeech: snapshot.partsOfSpeech.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    categories: snapshot.categories.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description || undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
}

export function parseDictionaryImport(raw: string): DictionaryExport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON を解析できませんでした。");
  }

  assertDictionaryImport(parsed);
  return parsed;
}

export async function replaceDictionaryFromImport(data: DictionaryExport): Promise<void> {
  assertDictionaryImport(data);

  await runTransaction(async (db) => {
    await db.execute(`DELETE FROM word_components`);
    await db.execute(`DELETE FROM examples`);
    await db.execute(`DELETE FROM word_categories`);
    await db.execute(`DELETE FROM words`);
    await db.execute(`DELETE FROM categories`);
    await db.execute(`DELETE FROM parts_of_speech`);

    for (const item of data.partsOfSpeech) {
      await db.execute(
        `INSERT INTO parts_of_speech (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          item.id,
          item.name,
          item.description ?? "",
          item.createdAt ?? nowIsoString(),
          item.updatedAt ?? nowIsoString(),
        ],
      );
    }

    for (const item of data.categories) {
      await db.execute(
        `INSERT INTO categories (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          item.id,
          item.name,
          item.description ?? "",
          item.createdAt ?? nowIsoString(),
          item.updatedAt ?? nowIsoString(),
        ],
      );
    }

    for (const word of data.words) {
      const wordId = word.id || createId("word");
      await db.execute(
        `INSERT INTO words (
          id,
          text,
          pronunciation,
          japanese,
          meaning,
          etymology,
          origin,
          notes,
          part_of_speech_id,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          wordId,
          word.text,
          word.pronunciation ?? "",
          word.japanese ?? "",
          word.meaning ?? "",
          word.etymology ?? "",
          word.origin ?? "",
          word.notes ?? "",
          word.partOfSpeechId ?? null,
          word.createdAt ?? nowIsoString(),
          word.updatedAt ?? nowIsoString(),
        ],
      );

      for (const categoryId of word.categoryIds ?? []) {
        await db.execute(
          `INSERT INTO word_categories (word_id, category_id) VALUES ($1, $2)`,
          [wordId, categoryId],
        );
      }

      for (const [index, example] of (word.examples ?? []).entries()) {
        await db.execute(
          `INSERT INTO examples (id, word_id, text, translation, note, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            example.id || createId("example"),
            wordId,
            example.text,
            example.translation ?? "",
            example.note ?? "",
            example.sortOrder ?? index,
          ],
        );
      }

      for (const [index, component] of (word.components ?? []).entries()) {
        await db.execute(
          `INSERT INTO word_components (id, word_id, text, meaning, linked_word_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            component.id || createId("component"),
            wordId,
            component.text,
            component.meaning ?? "",
            component.linkedWordId ?? null,
            component.sortOrder ?? index,
          ],
        );
      }
    }
  });
}
