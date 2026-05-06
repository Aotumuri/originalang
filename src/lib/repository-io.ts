import { EXPORT_VERSION } from "../constants";
import type { DictionaryExport, ExportWord } from "../types";
import { getDictionarySnapshot } from "./repository-queries";
import { assertDictionaryImport, runTransaction } from "./repository-shared";
import { createId, normalizeJapaneseTranslations, nowIsoString, splitJapaneseTranslations } from "./utils";

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
    await db.execute(`DELETE FROM word_translations`);
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
      const japanese = normalizeJapaneseTranslations(word.japanese ?? "");
      await db.execute(
        `INSERT INTO words (
          id,
          text,
          pronunciation,
          meaning,
          etymology,
          origin,
          notes,
          part_of_speech_id,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          wordId,
          word.text,
          word.pronunciation ?? "",
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

      for (const [index, translation] of splitJapaneseTranslations(japanese).entries()) {
        await db.execute(
          `INSERT INTO word_translations (id, word_id, text, embedding, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [createId("translation"), wordId, translation, null, index],
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
