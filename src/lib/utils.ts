import { BUILD_DIRECTORY_NAME, INITIAL_POS_FILE_NAMES } from "../constants";
import type {
  ManagedEntity,
  WordComponentRecord,
  WordDraft,
  WordListItem,
  WordRecord,
} from "../types";

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function toOptionalString(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function formatDateTime(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function createEmptyWordDraft(): WordDraft {
  const timestamp = nowIsoString();
  return {
    id: createId("word"),
    text: "",
    pronunciation: "",
    japanese: "",
    meaning: "",
    etymology: "",
    origin: "",
    notes: "",
    partOfSpeechId: null,
    partOfSpeechName: "",
    categoryIds: [],
    categoryNames: [],
    examples: [],
    components: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    isPersisted: false,
  };
}

export function createEmptyExample(wordId: string, sortOrder: number) {
  return {
    id: createId("example"),
    wordId,
    text: "",
    translation: "",
    note: "",
    sortOrder,
  };
}

export function createEmptyComponent(wordId: string, sortOrder: number): WordComponentRecord {
  return {
    id: createId("component"),
    wordId,
    text: "",
    meaning: "",
    linkedWordId: null,
    sortOrder,
  };
}

export function toWordListItem(word: WordRecord | WordDraft): WordListItem {
  return {
    id: word.id,
    text: word.text || "(未入力)",
    pronunciation: word.pronunciation,
    japanese: word.japanese,
    partOfSpeechId: word.partOfSpeechId,
    partOfSpeechName: word.partOfSpeechName,
    categoryNames: word.categoryNames,
    updatedAt: word.updatedAt,
    isDraft: "isPersisted" in word ? !word.isPersisted : false,
  };
}

export function upsertWordList(words: WordListItem[], item: WordListItem): WordListItem[] {
  const next = words.filter((word) => word.id !== item.id);
  next.unshift(item);
  return sortWordList(next);
}

export function removeWordListItem(words: WordListItem[], wordId: string): WordListItem[] {
  return words.filter((word) => word.id !== wordId);
}

export function sortWordList(words: WordListItem[]): WordListItem[] {
  return [...words].sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt) || left.text.localeCompare(right.text);
  });
}

export function sortManagedEntities(items: ManagedEntity[]): ManagedEntity[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, "ja"));
}

export function slugifyPartOfSpeechName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getPartOfSpeechFileName(
  entity: ManagedEntity,
  usedNames: Set<string>,
): string {
  const predefined = INITIAL_POS_FILE_NAMES[entity.name];
  const slug = predefined ?? slugifyPartOfSpeechName(entity.name);
  const candidate = slug || `pos-${entity.id}`;
  const fileName = candidate.endsWith(".txt") ? candidate : `${candidate}.txt`;

  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const fallback = `pos-${entity.id}.txt`;
  usedNames.add(fallback);
  return fallback;
}

export function buildDirectoryRelativePath(...segments: string[]): string {
  return [BUILD_DIRECTORY_NAME, ...segments].join("/");
}

export function backupFileName(): string {
  const suffix = nowIsoString().replace(/[:.]/g, "-");
  return `dictionary-backup-${suffix}.json`;
}

export function toSqliteUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");

  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `sqlite:///${normalized}`;
  }

  if (normalized.startsWith("/")) {
    return `sqlite://${normalized}`;
  }

  return `sqlite:${normalized}`;
}

export function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseComponentSegment(segment: string): {
  text: string;
  meaning: string;
} {
  const trimmed = segment.trim();
  const fullWidth = trimmed.match(/^(.*?)（(.*)）$/);
  if (fullWidth) {
    return {
      text: fullWidth[1].trim(),
      meaning: fullWidth[2].trim(),
    };
  }

  const halfWidth = trimmed.match(/^(.*?)\((.*)\)$/);
  if (halfWidth) {
    return {
      text: halfWidth[1].trim(),
      meaning: halfWidth[2].trim(),
    };
  }

  return {
    text: trimmed,
    meaning: "",
  };
}

export function extractComponentsFromEtymology(
  wordId: string,
  etymology: string,
  previousComponents: WordComponentRecord[] = [],
): WordComponentRecord[] {
  const previousByText = new Map(
    previousComponents
      .map((component) => [component.text.trim(), component] as const)
      .filter(([text]) => text.length > 0),
  );

  return etymology
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((segment, index) => {
      const parsed = parseComponentSegment(segment);
      const previous = previousComponents[index] ?? previousByText.get(parsed.text) ?? null;

      return {
        id: previous?.id ?? createId("component"),
        wordId,
        text: parsed.text,
        meaning: parsed.meaning || previous?.meaning || "",
        linkedWordId: previous?.linkedWordId ?? null,
        sortOrder: index,
      };
    })
    .filter((component) => component.text.length > 0);
}

export function formatComponentsAsEtymology(components: WordComponentRecord[]): string {
  return components
    .filter((component) => component.text.trim().length > 0)
    .map((component) => {
      const text = component.text.trim();
      const meaning = component.meaning.trim();
      return meaning ? `${text}（${meaning}）` : text;
    })
    .join(" + ");
}
