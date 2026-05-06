import type {
  DictionarySnapshot,
  ManagedEntity,
  SearchFilters,
  WordReference,
  WordListItem,
  WordRecord,
} from "../types";
import { withDatabase } from "./db";
import {
  buildWordSearchText,
  cosineSimilarity,
  createPassageEmbedding,
  createQueryEmbedding,
  parseEmbedding,
  serializeEmbedding,
} from "./semantic-search";
import {
  DbComponentRow,
  DbDuplicateRow,
  DbExampleRow,
  DbManagedRow,
  DbTranslationRow,
  DbWordCategoryRow,
  DbWordListRow,
  DbWordReferenceRow,
  DbWordRow,
  mapManagedEntity,
  mapWordListRow,
  mapWordRecord,
} from "./repository-shared";
import { joinJapaneseTranslations, splitJapaneseTranslations } from "./utils";

export async function listWords(filters: SearchFilters): Promise<WordListItem[]> {
  const queryText = filters.query.trim();
  const rows = await withDatabase((db) =>
    db.select<DbWordListRow[]>(
      `SELECT
        w.id,
        w.text,
        w.pronunciation,
        '' AS japanese,
        w.meaning,
        w.etymology,
        w.origin,
        w.notes,
        w.meaning_embedding,
        w.part_of_speech_id,
        p.name AS part_of_speech_name,
        GROUP_CONCAT(DISTINCT c.name) AS category_names,
        w.updated_at
      FROM words w
      LEFT JOIN parts_of_speech p ON p.id = w.part_of_speech_id
      LEFT JOIN word_categories wc ON wc.word_id = w.id
      LEFT JOIN categories c ON c.id = wc.category_id
      WHERE
        ($1 = '' OR COALESCE(w.part_of_speech_id, '') = $1)
        AND (
          $2 = '' OR EXISTS (
            SELECT 1
            FROM word_categories filtered_wc
            WHERE filtered_wc.word_id = w.id
              AND filtered_wc.category_id = $2
          )
        )
      GROUP BY w.id, p.name
      ORDER BY w.updated_at DESC, w.text ASC`,
      [filters.partOfSpeechId, filters.categoryId],
    ),
  );
  const rowsWithTranslations = await hydrateJapaneseTranslations(rows);

  if (!queryText) {
    return rowsWithTranslations.map(mapWordListRow);
  }

  const queryEmbedding = await createQueryEmbedding(queryText);
  if (!queryEmbedding) {
    return rowsWithTranslations.map(mapWordListRow);
  }

  const rowsWithEmbeddings = await ensureWordEmbeddings(rowsWithTranslations);
  const translationEmbeddings = await ensureTranslationEmbeddings(rowsWithEmbeddings);
  const scoredRows = rowsWithEmbeddings.map((row) => {
    const wordEmbedding = parseEmbedding(row.meaning_embedding);
    const wordScore = wordEmbedding ? cosineSimilarity(queryEmbedding, wordEmbedding) : Number.NEGATIVE_INFINITY;
    const translationScore = Math.max(
      Number.NEGATIVE_INFINITY,
      ...(translationEmbeddings.get(row.id) ?? []).map((embedding) => cosineSimilarity(queryEmbedding, embedding)),
    );
    const semanticScore = Math.max(wordScore, translationScore);
    const lexicalBoost = getLexicalBoost(row, queryText);

    return {
      row,
      semanticScore,
      lexicalBoost,
      combinedScore: semanticScore + lexicalBoost,
    };
  });

  scoredRows.sort((left, right) => {
    return (
      right.combinedScore - left.combinedScore ||
      right.semanticScore - left.semanticScore ||
      right.lexicalBoost - left.lexicalBoost ||
      right.row.updated_at.localeCompare(left.row.updated_at) ||
      left.row.text.localeCompare(right.row.text, "ja")
    );
  });

  return scoredRows.map(({ row }) => mapWordListRow(row));
}

async function ensureWordEmbeddings(rows: DbWordListRow[]): Promise<DbWordListRow[]> {
  const nextRows = [...rows];

  for (let index = 0; index < nextRows.length; index += 1) {
    const row = nextRows[index];
    if (parseEmbedding(row.meaning_embedding)) {
      continue;
    }

    const meaningEmbedding = serializeEmbedding(
      await createPassageEmbedding(
        buildWordSearchText({
          text: row.text,
          pronunciation: row.pronunciation,
          japanese: row.japanese,
          meaning: row.meaning,
          etymology: row.etymology,
          origin: row.origin,
          notes: row.notes,
          partOfSpeechName: row.part_of_speech_name,
          categoryNames: splitCategoryNames(row.category_names),
        }),
      ),
    );

    await withDatabase((db) =>
      db.execute(`UPDATE words SET meaning_embedding = $1 WHERE id = $2`, [meaningEmbedding, row.id]),
    );

    nextRows[index] = {
      ...row,
      meaning_embedding: meaningEmbedding,
    };
  }

  return nextRows;
}

async function ensureTranslationEmbeddings(rows: DbWordListRow[]): Promise<Map<string, number[][]>> {
  if (rows.length === 0) {
    return new Map();
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const translations = await withDatabase((db) =>
    db.select<DbTranslationRow[]>(
      `SELECT id, word_id, text, embedding, sort_order
       FROM word_translations
       ORDER BY word_id ASC, sort_order ASC`,
    ),
  );
  const embeddingsByWord = new Map<string, number[][]>();

  for (const translation of translations) {
    const row = rowsById.get(translation.word_id);
    if (!row) {
      continue;
    }

    let embedding = parseEmbedding(translation.embedding);
    if (!embedding) {
      const serializedEmbedding = serializeEmbedding(
        await createPassageEmbedding(
          [
            `語形: ${row.text}`,
            row.pronunciation ? `発音: ${row.pronunciation}` : "",
            `日本語訳: ${translation.text}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
      await withDatabase((db) =>
        db.execute(`UPDATE word_translations SET embedding = $1 WHERE id = $2`, [
          serializedEmbedding,
          translation.id,
        ]),
      );
      embedding = parseEmbedding(serializedEmbedding);
    }

    if (!embedding) {
      continue;
    }

    const list = embeddingsByWord.get(translation.word_id) ?? [];
    list.push(embedding);
    embeddingsByWord.set(translation.word_id, list);
  }

  return embeddingsByWord;
}

function splitCategoryNames(value: string | null | undefined): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function getLexicalBoost(row: DbWordListRow, queryText: string): number {
  const normalizedQuery = queryText.trim().toLocaleLowerCase("ja");
  if (!normalizedQuery) {
    return 0;
  }

  const haystacks = [
    row.text,
    row.pronunciation ?? "",
    row.japanese ?? "",
    row.meaning ?? "",
    row.etymology ?? "",
    row.origin ?? "",
    row.notes ?? "",
    row.part_of_speech_name ?? "",
    row.category_names ?? "",
  ]
    .map((value) => value.toLocaleLowerCase("ja"))
    .filter(Boolean);

  if (haystacks.some((value) => value === normalizedQuery)) {
    return 0.2;
  }

  if (haystacks.some((value) => value.includes(normalizedQuery))) {
    return 0.1;
  }

  return 0;
}

export async function getWord(wordId: string): Promise<WordRecord | null> {
  const snapshot = await getDictionarySnapshot();
  return snapshot.words.find((word) => word.id === wordId) ?? null;
}

export async function listAllWordReferences(): Promise<WordReference[]> {
  const rows = await withDatabase((db) =>
    db.select<DbWordReferenceRow[]>(
      `SELECT
         w.id,
         w.text,
         '' AS japanese
       FROM words w
       ORDER BY w.text ASC, w.updated_at DESC`,
    ),
  );
  const rowsWithTranslations = await hydrateJapaneseTranslations(rows);

  return rowsWithTranslations.map((row) => ({
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

  const rows = await withDatabase((db) =>
    db.select<DbDuplicateRow[]>(
      `SELECT
         w.id,
         w.text,
         '' AS japanese,
         w.pronunciation,
         w.updated_at
       FROM words w
       WHERE w.text = $1
         AND ($2 = '' OR w.id <> $2)
       ORDER BY w.updated_at DESC`,
      [candidate, excludeWordId ?? ""],
    ),
  );
  const rowsWithTranslations = await hydrateJapaneseTranslations(rows);

  return rowsWithTranslations.map((row) => ({
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

async function hydrateJapaneseTranslations<T extends { id: string; japanese?: string | null }>(
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) {
    return rows;
  }

  const translations = await withDatabase((db) =>
    db.select<DbTranslationRow[]>(
      `SELECT id, word_id, text, sort_order
       FROM word_translations
       ORDER BY word_id ASC, sort_order ASC`,
    ),
  );
  const translationsByWord = new Map<string, string[]>();

  for (const translation of translations) {
    const list = translationsByWord.get(translation.word_id) ?? [];
    list.push(translation.text);
    translationsByWord.set(translation.word_id, list);
  }

  return rows.map((row) => {
    const wordTranslations = translationsByWord.get(row.id) ?? [];
    return wordTranslations.length > 0
      ? { ...row, japanese: joinJapaneseTranslations(wordTranslations) }
      : { ...row, japanese: "" };
  });
}

export async function listPartsOfSpeech(): Promise<ManagedEntity[]> {
  const rows = await withDatabase((db) =>
    db.select<DbManagedRow[]>(
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
    ),
  );

  return rows.map(mapManagedEntity);
}

export async function listCategories(): Promise<ManagedEntity[]> {
  const rows = await withDatabase((db) =>
    db.select<DbManagedRow[]>(
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
    ),
  );

  return rows.map(mapManagedEntity);
}

export async function getDictionarySnapshot(): Promise<DictionarySnapshot> {
  const {
    partsOfSpeech,
    categories,
    words,
    translations,
    wordCategories,
    examples,
    components,
  } = await withDatabase(async (db) => ({
    partsOfSpeech: (
      await db.select<DbManagedRow[]>(
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
      )
    ).map(mapManagedEntity),
    categories: (
      await db.select<DbManagedRow[]>(
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
      )
    ).map(mapManagedEntity),
    words: await db.select<DbWordRow[]>(
      `SELECT
        id,
        text,
        pronunciation,
        '' AS japanese,
        meaning,
        etymology,
        origin,
        notes,
        meaning_embedding,
        part_of_speech_id,
        created_at,
        updated_at
       FROM words
       ORDER BY updated_at DESC, text ASC`,
    ),
    translations: await db.select<DbTranslationRow[]>(
      `SELECT id, word_id, text, sort_order
       FROM word_translations
       ORDER BY word_id ASC, sort_order ASC`,
    ),
    wordCategories: await db.select<DbWordCategoryRow[]>(
      `SELECT wc.word_id, wc.category_id, c.name AS category_name
       FROM word_categories wc
       JOIN categories c ON c.id = wc.category_id
       ORDER BY c.name ASC`,
    ),
    examples: await db.select<DbExampleRow[]>(
      `SELECT id, word_id, text, translation, note, sort_order
       FROM examples
       ORDER BY word_id ASC, sort_order ASC`,
    ),
    components: await db.select<DbComponentRow[]>(
      `SELECT id, word_id, text, meaning, linked_word_id, sort_order
       FROM word_components
       ORDER BY word_id ASC, sort_order ASC`,
    ),
  }));

  const posMap = new Map(partsOfSpeech.map((item) => [item.id, item.name]));
  const translationsByWord = new Map<string, string[]>();
  const categoryRowsByWord = new Map<string, DbWordCategoryRow[]>();
  const examplesByWord = new Map<string, WordRecord["examples"]>();
  const componentsByWord = new Map<string, WordRecord["components"]>();

  for (const row of translations) {
    const list = translationsByWord.get(row.word_id) ?? [];
    list.push(row.text);
    translationsByWord.set(row.word_id, list);
  }

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
      const translationList = translationsByWord.get(row.id) ?? [];
      return mapWordRecord(
        {
          ...row,
          japanese: joinJapaneseTranslations(translationList),
        },
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
