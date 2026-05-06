import { formatDateTime, formatJapaneseTranslations } from "../lib/utils";
import type { WordListItem } from "../types";

type WordListPaneProps = {
  words: WordListItem[];
  selectedWordId: string | null;
  isLoading: boolean;
  onSelectWord: (wordId: string) => void;
  onClearSelection: () => void;
};

export default function WordListPane({
  words,
  selectedWordId,
  isLoading,
  onSelectWord,
  onClearSelection,
}: WordListPaneProps) {
  return (
    <aside className="word-list-panel">
      <div className="panel-heading">
        <h2>単語一覧</h2>
        <div className="inline-actions">
          <span>{words.length} 件</span>
          {selectedWordId ? (
            <button className="secondary-button" type="button" onClick={onClearSelection}>
              選択解除
            </button>
          ) : null}
        </div>
      </div>
      <div className="word-list">
        {isLoading ? <p className="empty-state">読み込み中...</p> : null}
        {!isLoading && words.length === 0 ? <p className="empty-state">単語がありません。</p> : null}
        {words.map((word) => (
          <button
            className={`word-row ${selectedWordId === word.id ? "selected" : ""}`}
            key={word.id}
            type="button"
            onClick={() => onSelectWord(word.id)}
          >
            <div className="word-row-top">
              <strong>{word.text || "(未入力)"}</strong>
              {word.isDraft ? <span className="draft-chip">新規</span> : null}
            </div>
            <div className="word-row-sub">{formatJapaneseTranslations(word.japanese) || "日本語訳なし"}</div>
            <div className="word-row-meta">
              <span>{word.partOfSpeechName || "品詞未設定"}</span>
              <span>{formatDateTime(word.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
