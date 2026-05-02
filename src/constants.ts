export const APP_DB_NAME = "dictionary.db";
export const EXPORT_FILE_NAME = "dictionary-export.json";
export const BUILD_DIRECTORY_NAME = "build";
export const EXPORT_VERSION = 1;

export const INITIAL_PARTS_OF_SPEECH = [
  { id: "pos-noun", name: "名詞", description: "もの・概念・場所・存在を表す品詞" },
  { id: "pos-verb", name: "動詞", description: "動作・変化・状態を表す品詞" },
  { id: "pos-adjective", name: "形容詞", description: "性質や状態を表す品詞" },
  { id: "pos-adverb", name: "副詞", description: "動詞や形容詞などを補足する品詞" },
  { id: "pos-particle", name: "結語詞", description: "文法関係や機能を示す品詞" },
  { id: "pos-prefix", name: "接頭辞", description: "語の前に付いて意味を補う要素" },
  { id: "pos-suffix", name: "接尾辞", description: "語の後に付いて意味を補う要素" },
  { id: "pos-root", name: "語根", description: "語の中心となる基本要素" },
  { id: "pos-proper-noun", name: "固有名詞", description: "人名・地名・国家名など固有の名称" },
];

export const INITIAL_CATEGORIES = [
  { id: "cat-grammar", name: "文法", description: "文法要素・語順・助詞的要素に関する単語" },
  { id: "cat-daily", name: "日常", description: "挨拶や日常会話に関する単語" },
  {
    id: "cat-state-politics",
    name: "国家・政治",
    description: "国家、政治体制、統治、戦争、外交に関する単語",
  },
  { id: "cat-magic", name: "魔法", description: "魔法や儀式、超常的な力に関する単語" },
  { id: "cat-color", name: "色", description: "色彩や光の表現に関する単語" },
  { id: "cat-person", name: "人", description: "人、役職、人物像に関する単語" },
  { id: "cat-movement", name: "移動", description: "移動、方向、到達に関する単語" },
];

export const DEFAULT_WORD: Omit<
  import("./types").WordDraft,
  "id" | "createdAt" | "updatedAt"
> = {
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
  isPersisted: false,
};

export const INITIAL_POS_FILE_NAMES: Record<string, string> = {
  名詞: "nouns.txt",
  動詞: "verbs.txt",
  形容詞: "adjectives.txt",
  副詞: "adverbs.txt",
  結語詞: "particles.txt",
  接頭辞: "prefixes.txt",
  接尾辞: "suffixes.txt",
  語根: "roots.txt",
  固有名詞: "proper-nouns.txt",
};
