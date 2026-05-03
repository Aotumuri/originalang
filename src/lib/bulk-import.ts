import { extractComponentsFromEtymology } from "./etymology";
import { createId, nowIsoString } from "./utils";
import type { WordRecord } from "../types";

export type ParsedBulkWord = {
  id: string;
  text: string;
  pronunciation: string;
  japanese: string;
  etymology: string;
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
    source: value.trim(),
  };
}

export function toBulkImportedWord(entry: ParsedBulkWord): WordRecord {
  const timestamp = nowIsoString();
  const components = extractComponentsFromEtymology(entry.id, entry.etymology);

  return {
    id: entry.id,
    text: entry.text,
    pronunciation: entry.pronunciation,
    japanese: entry.japanese,
    meaning: "",
    etymology: entry.etymology,
    origin: "",
    notes: "",
    partOfSpeechId: null,
    partOfSpeechName: "",
    categoryIds: [],
    categoryNames: [],
    examples: [],
    components,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
