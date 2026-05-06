import { extractComponentsFromEtymology } from "./etymology";
import { createId, nowIsoString } from "./utils";
import type { ManagedEntity, WordRecord } from "../types";

export type ParsedBulkWord = {
  id: string;
  text: string;
  pronunciation: string;
  japanese: string;
  etymology: string;
  meaning: string;
  origin: string;
  notes: string;
  source: string;
};

export type BulkImportParseResult = {
  entries: ParsedBulkWord[];
  invalidEntries: string[];
};

const COLUMN_SEPARATOR_PATTERN = /(?:　+|\t+| {2,})/;
const ENTRY_SPLIT_PATTERN = /\s+(?=\S+[（(][^）)]+[）)](?:　+|\t+| {2,}))/g;

export function parseBulkImportText(raw: string): BulkImportParseResult {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { entries: [], invalidEntries: [] };
  }

  const candidates = splitBulkImportEntries(normalized);
  const entries: ParsedBulkWord[] = [];
  const invalidEntries: string[] = [];

  for (const candidate of candidates) {
    const parsed = parseBulkImportEntry(candidate);
    if (parsed) {
      entries.push(parsed);
      continue;
    }
    invalidEntries.push(candidate);
  }

  return { entries, invalidEntries };
}

function splitBulkImportEntries(value: string): string[] {
  if (hasLabeledBulkEntries(value)) {
    return splitLabeledBulkImportEntries(value);
  }

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return value
    .split(ENTRY_SPLIT_PATTERN)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBulkImportEntry(value: string): ParsedBulkWord | null {
  const labeledEntry = parseLabeledBulkImportEntry(value);
  if (labeledEntry) {
    return labeledEntry;
  }

  const match = value.match(/^(.*?)\s*(?:（([^）]+)）|\(([^)]+)\))(.*)$/);
  if (!match) {
    return null;
  }

  const text = match[1].trim();
  const pronunciation = (match[2] ?? match[3] ?? "").trim();
  const rest = match[4].trim();
  const columns = rest.split(COLUMN_SEPARATOR_PATTERN).map((column) => column.trim()).filter(Boolean);

  if (!text || columns.length < 2) {
    return null;
  }

  return {
    id: createId("word"),
    text,
    pronunciation,
    japanese: columns[0],
    etymology: columns.slice(1).join(" "),
    meaning: "",
    origin: "",
    notes: "",
    source: value.trim(),
  };
}

function hasLabeledBulkEntries(value: string): boolean {
  return value
    .split("\n")
    .some((line) => normalizeLabel(line.split(/[：:]/, 1)[0] ?? "") === "言語表記");
}

function splitLabeledBulkImportEntries(value: string): string[] {
  const entries: string[] = [];
  const current: string[] = [];

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    const isEntryStart = normalizeLabel(trimmed.split(/[：:]/, 1)[0] ?? "") === "言語表記";

    if (isEntryStart && current.some((item) => item.trim())) {
      entries.push(current.join("\n").trim());
      current.length = 0;
    }

    if (!trimmed && current.some((item) => item.trim())) {
      entries.push(current.join("\n").trim());
      current.length = 0;
      continue;
    }

    current.push(line);
  }

  if (current.some((item) => item.trim())) {
    entries.push(current.join("\n").trim());
  }

  return entries.filter(Boolean);
}

function parseLabeledBulkImportEntry(value: string): ParsedBulkWord | null {
  const fields: Partial<Record<keyof Omit<ParsedBulkWord, "id" | "source">, string>> = {};
  let activeField: keyof typeof fields | null = null;

  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (match) {
      const resolvedLabel = resolveBulkLabel(match[1]);
      if (!resolvedLabel) {
        activeField = null;
        continue;
      }

      fields[resolvedLabel.field] = appendBulkFieldValue(
        fields[resolvedLabel.field],
        formatBulkFieldValue(match[2].trim(), resolvedLabel.prefix),
      );
      activeField = resolvedLabel.field;
      continue;
    }

    if (activeField) {
      fields[activeField] = [fields[activeField], trimmed].filter(Boolean).join("\n");
    }
  }

  const text = fields.text?.trim() ?? "";
  if (!text) {
    return null;
  }

  return {
    id: createId("word"),
    text,
    pronunciation: fields.pronunciation?.trim() ?? "",
    japanese: fields.japanese?.trim() ?? "",
    etymology: fields.etymology?.trim() ?? "",
    meaning: fields.meaning?.trim() ?? "",
    origin: fields.origin?.trim() ?? "",
    notes: fields.notes?.trim() ?? "",
    source: value.trim(),
  };
}

type BulkLabelResolution = {
  field: keyof Omit<ParsedBulkWord, "id" | "source">;
  prefix?: string;
};

function resolveBulkLabel(label: string): BulkLabelResolution | null {
  switch (normalizeLabel(label)) {
    case "言語表記":
    case "単語":
      return { field: "text" };
    case "発音":
    case "読み":
      return { field: "pronunciation" };
    case "日本語訳":
    case "訳":
      return { field: "japanese" };
    case "構成":
      return { field: "etymology" };
    case "意味":
      return { field: "meaning" };
    case "由来":
      return { field: "origin" };
    case "省略語":
    case "略語":
      return { field: "notes", prefix: "省略語" };
    case "メモ":
    case "備考":
      return { field: "notes" };
    default:
      return null;
  }
}

function appendBulkFieldValue(current: string | undefined, next: string): string {
  if (!next) {
    return current ?? "";
  }

  return [current, next].filter(Boolean).join("\n");
}

function formatBulkFieldValue(value: string, prefix?: string): string {
  if (!prefix || !value) {
    return value;
  }

  return `${prefix}: ${value}`;
}

function normalizeLabel(label: string): string {
  return label.replace(/\s/g, "").trim();
}

export function toBulkImportedWord(
  entry: ParsedBulkWord,
  partOfSpeech?: Pick<ManagedEntity, "id" | "name"> | null,
): WordRecord {
  const timestamp = nowIsoString();
  const components = extractComponentsFromEtymology(entry.id, entry.etymology);

  return {
    id: entry.id,
    text: entry.text,
    pronunciation: entry.pronunciation,
    japanese: entry.japanese,
    meaning: entry.meaning,
    etymology: entry.etymology,
    origin: entry.origin,
    notes: entry.notes,
    partOfSpeechId: partOfSpeech?.id ?? null,
    partOfSpeechName: partOfSpeech?.name ?? "",
    categoryIds: [],
    categoryNames: [],
    examples: [],
    components,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
