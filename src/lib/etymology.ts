import type { WordComponentRecord } from "../types";
import { createId } from "./utils";

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
