import type {
  FlashMessage,
  ManagedEntity,
  SaveState,
  WordDraft,
  WordListItem,
  WordRecord,
} from "../types";
import { sortWordList, toWordListItem } from "./utils";

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return "同名の項目がすでに存在します。";
    }
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown };

    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message;
    }

    if (typeof candidate.error === "string" && candidate.error) {
      return candidate.error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      // Fall through to generic message below.
    }
  }

  return "不明なエラーが発生しました。";
}

export function createFlashMessage(
  tone: FlashMessage["tone"],
  text: string,
): FlashMessage {
  return { tone, text };
}

export function enrichWord(
  word: WordRecord | WordDraft,
  partsOfSpeech: ManagedEntity[],
  categories: ManagedEntity[],
): WordDraft {
  const partOfSpeechName = word.partOfSpeechId
    ? partsOfSpeech.find((item) => item.id === word.partOfSpeechId)?.name ?? ""
    : "";
  const categoryNames = word.categoryIds
    .map((categoryId) => categories.find((item) => item.id === categoryId)?.name ?? "")
    .filter(Boolean);

  return {
    ...word,
    partOfSpeechName,
    categoryNames,
    isPersisted: "isPersisted" in word ? word.isPersisted : true,
  };
}

export function statusLabel(status: SaveState): string {
  switch (status) {
    case "saving":
      return "保存中";
    case "error":
      return "保存エラー";
    default:
      return "保存済み";
  }
}

export function getRenderedWords(
  words: WordListItem[],
  draft: WordDraft | null,
  isDirty: boolean,
): WordListItem[] {
  if (!draft) {
    return words;
  }

  if (!draft.isPersisted || isDirty || !words.some((word) => word.id === draft.id)) {
    return sortWordList([
      toWordListItem(draft),
      ...words.filter((word) => word.id !== draft.id),
    ]);
  }

  return words;
}
