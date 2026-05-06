import { splitJapaneseTranslations } from "./utils";

const EMBEDDING_MODEL_ID = "intfloat/multilingual-e5-small";
const EMBEDDING_DIMENSION = 384;
const PASSAGE_PREFIX = "passage: ";
const QUERY_PREFIX = "query: ";

type SearchTextSource = {
  text: string;
  pronunciation?: string | null;
  japanese?: string | null;
  meaning?: string | null;
  etymology?: string | null;
  origin?: string | null;
  notes?: string | null;
  partOfSpeechName?: string | null;
  categoryNames?: string[];
};

type FeatureExtractor = (
  text: string,
  options?: {
    pooling?: "none" | "mean" | "cls";
    normalize?: boolean;
  },
) => Promise<{ data: ArrayLike<number> }>;

let extractorPromise: Promise<unknown> | null = null;

async function getFeatureExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
        dtype: "fp32",
      });
    })();
  }

  const extractor = await extractorPromise;
  return extractor as FeatureExtractor;
}

export function buildWordSearchText(source: SearchTextSource): string {
  const japaneseTranslations = splitJapaneseTranslations(source.japanese ?? "");
  const sections = [
    ["語形", source.text],
    ["発音", source.pronunciation ?? ""],
    ["日本語訳", japaneseTranslations.map((translation) => `- ${translation}`).join("\n")],
    ["意味", source.meaning ?? ""],
    ["構成", source.etymology ?? ""],
    ["由来", source.origin ?? ""],
    ["メモ", source.notes ?? ""],
    ["品詞", source.partOfSpeechName ?? ""],
    ["カテゴリ", (source.categoryNames ?? []).join(" / ")],
  ]
    .map(([label, value]) => [label, value.trim()] as const)
    .filter(([, value]) => value.length > 0);

  return sections.map(([label, value]) => `${label}: ${value}`).join("\n");
}

async function createEmbedding(prefixedText: string): Promise<number[] | null> {
  if (!prefixedText.trim()) {
    return null;
  }

  const extractor = await getFeatureExtractor();
  const output = await extractor(prefixedText, {
    pooling: "mean",
    normalize: true,
  });

  const vector = Array.from(output.data);
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `埋め込み次元が不正です。期待値: ${EMBEDDING_DIMENSION}, 実際: ${vector.length}`,
    );
  }

  return vector;
}

export async function createPassageEmbedding(searchText: string): Promise<number[] | null> {
  const normalizedText = searchText.trim();
  if (!normalizedText) {
    return null;
  }

  return createEmbedding(`${PASSAGE_PREFIX}${normalizedText}`);
}

export async function createQueryEmbedding(queryText: string): Promise<number[] | null> {
  const normalizedText = queryText.trim();
  if (!normalizedText) {
    return null;
  }

  return createEmbedding(`${QUERY_PREFIX}${normalizedText}`);
}

export function serializeEmbedding(embedding: number[] | null): string | null {
  return embedding ? JSON.stringify(embedding) : null;
}

export function parseEmbedding(value: string | null | undefined): number[] | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIMENSION) {
      return null;
    }

    const vector = parsed.map((item) => (typeof item === "number" ? item : Number(item)));
    return vector.every((item) => Number.isFinite(item)) ? vector : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}
