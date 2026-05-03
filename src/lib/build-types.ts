import type { WordRecord } from "../types";

export type PartFileInfo = {
  id: string;
  name: string;
  fileName: string;
  relativePath: string;
  words: WordRecord[];
};
