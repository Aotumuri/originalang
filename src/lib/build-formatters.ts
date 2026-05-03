import type { DictionarySnapshot, ManagedEntity, WordRecord } from "../types";
import type { PartFileInfo } from "./build-types";
import { nowIsoString } from "./utils";

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function joinCategories(word: WordRecord): string {
  return word.categoryNames.length > 0 ? word.categoryNames.join(" / ") : "未設定";
}

function joinExamples(word: WordRecord): string[] {
  if (word.examples.length === 0) {
    return ["使用例:"];
  }

  const lines = ["使用例:"];
  for (const example of word.examples) {
    lines.push(`- ${example.text}`);
    if (example.translation) {
      lines.push(`  訳: ${example.translation}`);
    }
    if (example.note) {
      lines.push(`  メモ: ${example.note}`);
    }
  }
  return lines;
}

export function buildPartOfSpeechFile(part: PartFileInfo): string {
  const blocks = [`# ${part.name}`];

  for (const word of part.words) {
    blocks.push(`## ${word.text}`);
    blocks.push(line("発音", word.pronunciation));
    blocks.push(line("日本語訳", word.japanese));
    blocks.push(line("品詞", word.partOfSpeechName || "未設定"));
    blocks.push(line("カテゴリ", joinCategories(word)));
    blocks.push(line("構成", word.etymology));
    blocks.push(line("意味", word.meaning));
    blocks.push(...joinExamples(word));
    blocks.push(line("由来", word.origin));
    blocks.push(line("メモ", word.notes));
    blocks.push("");
  }

  return blocks.join("\n").trimEnd() + "\n";
}

export function buildMetadata(snapshot: DictionarySnapshot): string {
  return [
    "# Dictionary Metadata",
    "Version: 1",
    `Word Count: ${snapshot.words.length}`,
    `Part of Speech Count: ${snapshot.partsOfSpeech.length}`,
    `Category Count: ${snapshot.categories.length}`,
    `Built At: ${nowIsoString()}`,
    "Database: dictionary.db",
    "",
  ].join("\n");
}

export function buildAllWordsIndex(snapshot: DictionarySnapshot): string {
  const lines = ["# 全単語索引"];

  for (const word of snapshot.words) {
    lines.push(
      `- ${word.text} / ${word.pronunciation || "-"} / ${word.japanese || "-"} / ${word.partOfSpeechName || "未設定"} / ${joinCategories(word)}`,
    );
  }

  return lines.join("\n") + "\n";
}

export function buildCategoriesFile(categories: ManagedEntity[]): string {
  const lines = ["# カテゴリ一覧"];

  for (const category of categories) {
    lines.push(`## ${category.name}`);
    lines.push(`説明: ${category.description || "説明なし"}`);
  }

  return lines.join("\n") + "\n";
}

export function buildCategoryIndex(snapshot: DictionarySnapshot): string {
  const lines = ["# カテゴリ別索引"];

  for (const category of snapshot.categories) {
    lines.push(`## ${category.name}`);
    const words = snapshot.words.filter((word) => word.categoryIds.includes(category.id));
    if (words.length === 0) {
      lines.push("- 該当なし");
      continue;
    }

    for (const word of words) {
      lines.push(`- ${word.text}`);
    }
  }

  return lines.join("\n") + "\n";
}

export function buildReadme(partFiles: PartFileInfo[]): string {
  const posFileLines = partFiles.length
    ? partFiles.map((part) => `- ${part.name}: parts-of-speech/${part.fileName}`)
    : ["- まだ品詞別ファイルはありません"];

  return [
    "# 独自言語辞書 Build README",
    "このフォルダは、独自言語辞書アプリから生成されたTXT Buildです。",
    "AIや外部ツールに渡しやすいように、辞書データを複数のテキストファイルに分割しています。",
    "## 推奨される読み方",
    "AIがこの辞書を参照する場合は、以下の順番で読むことを推奨します。",
    "1. README.txt",
    "2. metadata.txt",
    "3. all-words.txt",
    "4. categories.txt",
    "5. category-index.txt",
    "6. parts-of-speech/ 以下の各品詞ファイル",
    "## ファイル一覧",
    "### metadata.txt",
    "辞書全体のメタ情報です。",
    "含まれる情報:",
    "- 辞書バージョン",
    "- 単語数",
    "- 品詞数",
    "- カテゴリ数",
    "- Build日時",
    "- 使用DB名",
    "### all-words.txt",
    "全単語の短い索引です。",
    "ここには単語の詳細説明はありません。",
    "### categories.txt",
    "カテゴリの定義一覧です。",
    "ここには単語の詳細は書かれていません。",
    "### category-index.txt",
    "カテゴリ別の短い単語索引です。",
    "ここには単語の詳細は書かれていません。",
    "### parts-of-speech/",
    "品詞ごとの詳細ファイルが入っているフォルダです。",
    "単語の詳細情報は基本的にこのフォルダ内の品詞別ファイルに書かれています。",
    "実際に生成された品詞別ファイル:",
    ...posFileLines,
    "## 品詞とカテゴリの違い",
    "品詞は、単語の文法上の役割です。",
    "カテゴリは、単語の意味分野です。",
    "同じ品詞の単語でも、複数のカテゴリに属することがあります。",
    "## 索引ファイルと詳細ファイルの違い",
    "all-words.txt と category-index.txt は索引用です。",
    "単語の詳細は parts-of-speech/ 以下の品詞別ファイルを参照してください。",
    "## 注意点",
    "- README.txt は説明用ファイルです。",
    "- categories.txt はカテゴリ定義用であり、単語詳細は含みません。",
    "- 品詞やカテゴリはユーザーが自由に追加できます。",
    "- このBuildは外部利用用の出力であり、編集用の元データは SQLite DB に保存されています。",
    "",
  ].join("\n");
}
