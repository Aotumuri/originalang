# Originalang Dictionary

Tauri v2 + React + TypeScript + SQLite で作った、独自言語のためのローカル辞書管理アプリです。

Web サイトではなく、ローカルで UI が開くデスクトップアプリとして動作します。  
単語、品詞、カテゴリ、構成、意味、由来、使用例、メモを SQLite DB に保存し、JSON バックアップと TXT Build を行えます。

## 技術構成

- Tauri v2
- React
- TypeScript
- Rust
- SQLite
- `@tauri-apps/plugin-sql`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-opener`

## 主な機能

- 単語の追加、編集、削除
- 品詞の追加、編集、削除
- カテゴリの追加、編集、削除
- 言語表記、発音、日本語訳、意味、構成、由来、メモの保存
- 使用例の複数登録
- カテゴリの複数選択
- 部分一致検索
- 品詞フィルター
- カテゴリフィルター
- JSON エクスポート
- JSON インポート
- 日時付きバックアップ作成
- SQLite DB から TXT Build を生成

## 保存先

メイン保存は JSON ではなく SQLite です。

- DB: `dictionary.db`
- 保存場所: Tauri の App Data ディレクトリ

JSON はバックアップと移行用です。

- エクスポート既定名: `dictionary-export.json`

TXT Build も App Data 配下に出力されます。

- 出力先: `build/`

## 開発環境

必要なもの:

- Node.js
- npm
- Rust
- Cargo
- Xcode Command Line Tools または Xcode

## セットアップ

```bash
npm install
```

## 起動

開発モード:

```bash
npm run tauri dev
```

フロントエンドだけ確認したい場合:

```bash
npm run dev
```

## ビルド確認

フロントエンド:

```bash
npm run build
```

Rust / Tauri 側:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 画面構成

- 上部: 検索、フィルター、各種操作ボタン、保存状態表示
- 左側: 単語一覧
- 右側: 単語の詳細編集フォーム

## データ構造

SQLite の主なテーブル:

- `words`
- `parts_of_speech`
- `categories`
- `word_categories`
- `examples`
- `word_components`

品詞とカテゴリは固定 enum ではなく、DB 管理です。  
初回起動時に初期データを投入しますが、その後は自由に追加・編集・削除できます。

## TXT Build

Build は編集用 DB を置き換えるものではなく、外部利用用の出力です。  
SQLite DB の内容から、人間や AI が読みやすい複数の `.txt` ファイルを生成します。

出力例:

```text
build/
  README.txt
  all-words.txt
  categories.txt
  category-index.txt
  metadata.txt
  parts-of-speech/
    nouns.txt
    verbs.txt
    custom-pos-name.txt
```

方針:

- 単語詳細は原則 `parts-of-speech/*.txt`
- `all-words.txt` は短い索引
- `category-index.txt` はカテゴリ別の短い索引
- `categories.txt` はカテゴリ定義
- `README.txt` は Build 全体の説明

## JSON インポート / エクスポート

JSON 形式はバックアップと移行用です。  
インポート時は既存 DB 内容を置き換えます。

最低限の検証:

- `version`
- `words`
- `partsOfSpeech`
- `categories`

## 主なファイル

- [src/App.tsx](src/App.tsx): メイン UI
- [src/lib/db.ts](src/lib/db.ts): DB 初期化
- [src/lib/repository.ts](src/lib/repository.ts): SQLite CRUD と JSON 入出力
- [src/lib/build.ts](src/lib/build.ts): TXT Build 生成
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs): Tauri プラグイン登録
- [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json): Tauri 設定

## 補足

- 現在はローカル開発を優先して `bundle.active` は `false` です。
- 配布用アプリ化を進める場合は、正式なアイコンや bundle 設定を追加してください。
