export type SaveState = "saved" | "saving" | "error";

export type SearchFilters = {
  query: string;
  partOfSpeechId: string;
  categoryId: string;
};

export type ManagedEntity = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
};

export type ExampleRecord = {
  id: string;
  wordId: string;
  text: string;
  translation: string;
  note: string;
  sortOrder: number;
};

export type WordComponentRecord = {
  id: string;
  wordId: string;
  text: string;
  meaning: string;
  linkedWordId: string | null;
  sortOrder: number;
};

export type WordReference = {
  id: string;
  text: string;
  japanese: string;
};

export type WordRecord = {
  id: string;
  text: string;
  pronunciation: string;
  japanese: string;
  meaning: string;
  etymology: string;
  origin: string;
  notes: string;
  partOfSpeechId: string | null;
  partOfSpeechName: string;
  categoryIds: string[];
  categoryNames: string[];
  examples: ExampleRecord[];
  components: WordComponentRecord[];
  createdAt: string;
  updatedAt: string;
};

export type WordDraft = WordRecord & {
  isPersisted: boolean;
};

export type WordListItem = {
  id: string;
  text: string;
  pronunciation: string;
  japanese: string;
  partOfSpeechId: string | null;
  partOfSpeechName: string;
  categoryNames: string[];
  updatedAt: string;
  isDraft?: boolean;
};

export type DictionarySnapshot = {
  words: WordRecord[];
  partsOfSpeech: ManagedEntity[];
  categories: ManagedEntity[];
};

export type DictionaryExport = {
  version: number;
  exportedAt: string;
  words: ExportWord[];
  partsOfSpeech: ExportManagedEntity[];
  categories: ExportManagedEntity[];
};

export type ExportManagedEntity = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExportWord = {
  id: string;
  text: string;
  pronunciation?: string;
  japanese?: string;
  meaning?: string;
  etymology?: string;
  origin?: string;
  notes?: string;
  partOfSpeechId?: string;
  categoryIds: string[];
  examples: ExportExample[];
  components: ExportWordComponent[];
  createdAt: string;
  updatedAt: string;
};

export type ExportExample = {
  id: string;
  wordId: string;
  text: string;
  translation?: string;
  note?: string;
  sortOrder: number;
};

export type ExportWordComponent = {
  id: string;
  wordId: string;
  text: string;
  meaning?: string;
  linkedWordId?: string;
  sortOrder: number;
};

export type FlashMessage = {
  tone: "info" | "success" | "error";
  text: string;
};
