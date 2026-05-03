import { formatDateTime } from "../lib/utils";
import type {
  ExampleRecord,
  ManagedEntity,
  WordComponentRecord,
  WordDraft,
  WordListItem,
  WordReference,
} from "../types";
import ExamplesEditor from "./ExamplesEditor";
import WordComponentsEditor from "./WordComponentsEditor";

type WordEditorPaneProps = {
  draft: WordDraft | null;
  partsOfSpeech: ManagedEntity[];
  categories: ManagedEntity[];
  duplicateWords: WordListItem[];
  wordReferences: WordReference[];
  onSave: () => void;
  onDelete: () => void;
  onFieldChange: (field: keyof Pick<
    WordDraft,
    "text" | "pronunciation" | "japanese" | "etymology" | "meaning" | "origin" | "notes"
  >, value: string) => void;
  onPartOfSpeechChange: (partOfSpeechId: string) => void;
  onCategoryToggle: (categoryId: string, checked: boolean) => void;
  onExtractComponents: () => void;
  onAddComponent: () => void;
  onUpdateComponent: (
    componentId: string,
    patch: Partial<Pick<WordComponentRecord, "text" | "meaning" | "linkedWordId">>,
  ) => void;
  onDeleteComponent: (componentId: string) => void;
  onOpenLinkedWord: (wordId: string) => void;
  onAddExample: () => void;
  onUpdateExample: (
    exampleId: string,
    patch: Partial<Pick<ExampleRecord, "text" | "translation" | "note">>,
  ) => void;
  onDeleteExample: (exampleId: string) => void;
};

export default function WordEditorPane({
  draft,
  partsOfSpeech,
  categories,
  duplicateWords,
  wordReferences,
  onSave,
  onDelete,
  onFieldChange,
  onPartOfSpeechChange,
  onCategoryToggle,
  onExtractComponents,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onOpenLinkedWord,
  onAddExample,
  onUpdateExample,
  onDeleteExample,
}: WordEditorPaneProps) {
  if (!draft) {
    return (
      <section className="editor-panel">
        <div className="empty-editor">
          <h2>単語を選択してください</h2>
          <p>左側の一覧から単語を選択するか、「単語追加」で新しい単語を作成します。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-panel">
      <div className="panel-heading">
        <div>
          <h2>{draft.text || "新規単語"}</h2>
          <span>最終更新: {formatDateTime(draft.updatedAt)}</span>
        </div>
        <div className="editor-actions">
          <button type="button" onClick={onSave}>
            保存
          </button>
          <button className="danger-button" type="button" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>

      {!draft.text.trim() ? <p className="warning-text">言語表記は必須です。</p> : null}
      {duplicateWords.length > 0 ? (
        <div className="warning-box">
          <strong>重複警告</strong>
          <ul>
            {duplicateWords.map((word) => (
              <li key={word.id}>
                {word.text} / {word.japanese || "日本語訳なし"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          <span>言語表記</span>
          <input value={draft.text} onChange={(event) => onFieldChange("text", event.target.value)} />
        </label>

        <label>
          <span>発音</span>
          <input
            value={draft.pronunciation}
            onChange={(event) => onFieldChange("pronunciation", event.target.value)}
          />
        </label>

        <label>
          <span>日本語訳</span>
          <input
            value={draft.japanese}
            onChange={(event) => onFieldChange("japanese", event.target.value)}
          />
        </label>

        <label>
          <span>品詞</span>
          <select
            value={draft.partOfSpeechId ?? ""}
            onChange={(event) => onPartOfSpeechChange(event.target.value)}
          >
            <option value="">未設定</option>
            {partsOfSpeech.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="full-width">
          <span className="field-label">カテゴリ</span>
          <div className="checkbox-grid">
            {categories.map((category) => (
              <label className="checkbox-item" key={category.id}>
                <input
                  checked={draft.categoryIds.includes(category.id)}
                  type="checkbox"
                  onChange={(event) => onCategoryToggle(category.id, event.target.checked)}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="full-width">
          <span>構成</span>
          <textarea
            rows={4}
            value={draft.etymology}
            onChange={(event) => onFieldChange("etymology", event.target.value)}
          />
        </label>

        <WordComponentsEditor
          components={draft.components}
          currentWordId={draft.id}
          wordReferences={wordReferences}
          onAdd={onAddComponent}
          onDelete={onDeleteComponent}
          onExtractFromEtymology={onExtractComponents}
          onOpenLinkedWord={onOpenLinkedWord}
          onUpdate={onUpdateComponent}
        />

        <label className="full-width">
          <span>意味</span>
          <textarea
            rows={5}
            value={draft.meaning}
            onChange={(event) => onFieldChange("meaning", event.target.value)}
          />
        </label>

        <label className="full-width">
          <span>由来</span>
          <textarea
            rows={5}
            value={draft.origin}
            onChange={(event) => onFieldChange("origin", event.target.value)}
          />
        </label>

        <label className="full-width">
          <span>メモ</span>
          <textarea
            rows={5}
            value={draft.notes}
            onChange={(event) => onFieldChange("notes", event.target.value)}
          />
        </label>

        <ExamplesEditor
          examples={draft.examples}
          onAdd={onAddExample}
          onDelete={onDeleteExample}
          onUpdate={onUpdateExample}
        />
      </div>
    </section>
  );
}
