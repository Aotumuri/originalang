import { INITIAL_CATEGORIES, INITIAL_PARTS_OF_SPEECH } from "../constants";
import { extractComponentsFromEtymology } from "./etymology";
import { listCategories, listPartsOfSpeech } from "./repository-queries";
import {
  buildWordSearchText,
  createPassageEmbedding,
  serializeEmbedding,
} from "./semantic-search";
import {
  getPersistedManagedEntity,
  normalizeComponents,
  normalizeExamples,
  runTransaction,
} from "./repository-shared";
import { nowIsoString, toOptionalString } from "./utils";
import type { ManagedEntity, WordRecord } from "../types";

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
  const components =
    word.components.length > 0
      ? normalizeComponents(word.id, word.components)
      : extractComponentsFromEtymology(word.id, word.etymology);

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
  const searchText = buildWordSearchText(normalized);
  const meaningEmbedding = serializeEmbedding(await createPassageEmbedding(searchText));

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
        meaning_embedding,
        part_of_speech_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        pronunciation = excluded.pronunciation,
        japanese = excluded.japanese,
        meaning = excluded.meaning,
        etymology = excluded.etymology,
        origin = excluded.origin,
        notes = excluded.notes,
        meaning_embedding = excluded.meaning_embedding,
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
        meaningEmbedding,
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

    for (const item of INITIAL_PARTS_OF_SPEECH) {
      await db.execute(
        `INSERT INTO parts_of_speech (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.name, item.description, timestamp, timestamp],
      );
    }

    for (const item of INITIAL_CATEGORIES) {
      await db.execute(
        `INSERT INTO categories (id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, item.name, item.description, timestamp, timestamp],
      );
    }
  });
}
