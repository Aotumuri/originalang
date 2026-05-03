import type { DictionarySnapshot } from "../types";
import type { PartFileInfo } from "./build-types";
import { buildDirectoryRelativePath, getPartOfSpeechFileName } from "./utils";

export function buildPartFiles(snapshot: DictionarySnapshot): PartFileInfo[] {
  const usedFileNames = new Set<string>();
  const parts: PartFileInfo[] = snapshot.partsOfSpeech.map((part) => {
    const fileName = getPartOfSpeechFileName(part, usedFileNames);
    return {
      id: part.id,
      name: part.name,
      fileName,
      relativePath: buildDirectoryRelativePath("parts-of-speech", fileName),
      words: snapshot.words.filter((word) => word.partOfSpeechId === part.id),
    };
  });

  const unassignedWords = snapshot.words.filter((word) => !word.partOfSpeechId);
  if (unassignedWords.length > 0) {
    const fileName = usedFileNames.has("unassigned.txt") ? "pos-unassigned.txt" : "unassigned.txt";
    parts.push({
      id: "unassigned",
      name: "未設定",
      fileName,
      relativePath: buildDirectoryRelativePath("parts-of-speech", fileName),
      words: unassignedWords,
    });
  }

  return parts.filter((part) => part.words.length > 0);
}
