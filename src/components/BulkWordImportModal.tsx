import type { ParsedBulkWord } from "../lib/bulk-import";
import type { ManagedEntity } from "../types";

type BulkWordImportModalProps = {
  isOpen: boolean;
  rawText: string;
  parsedEntries: ParsedBulkWord[];
  invalidEntries: string[];
  partsOfSpeech: ManagedEntity[];
  partOfSpeechId: string;
  isSubmitting: boolean;
  onRawTextChange: (value: string) => void;
  onPartOfSpeechChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

export default function BulkWordImportModal({
  isOpen,
  rawText,
  parsedEntries,
  invalidEntries,
  partsOfSpeech,
  partOfSpeechId,
  isSubmitting,
  onRawTextChange,
  onPartOfSpeechChange,
  onClose,
  onImport,
}: BulkWordImportModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>単語一括入力</h2>
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>
            閉じる
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-help-text">
            `単語（読み）　日本語訳　構成` または `言語表記：...` から始まるラベル付き形式で貼り付けます。
          </p>
          <textarea
            className="bulk-input-textarea"
            rows={10}
            value={rawText}
            placeholder={`例:
言語表記：λдrazи
発音　　：/ˈla.dra.zi/（ラドラジ）
日本語訳：年
構成　　：λ（広がり・循環）+ дrazи（日）
省略語　：λaд（ラド）
意味　　：多くの日が巡り、再び同じ位置へ戻る長期循環の単位。
由来　　：時間が「広く展開し、包み直される」感覚をλで表現。`}
            onChange={(event) => onRawTextChange(event.target.value)}
            disabled={isSubmitting}
          />

          <div className="bulk-import-summary">
            <span className="usage-chip">解析成功: {parsedEntries.length}</span>
            <span className="usage-chip">未解析: {invalidEntries.length}</span>
          </div>

          {parsedEntries.length > 0 ? (
            <div className="bulk-preview-list">
              {parsedEntries.map((entry) => (
                <div className="bulk-preview-item" key={entry.id}>
                  <strong>{entry.text}</strong>
                  <span>{entry.pronunciation || "発音なし"}</span>
                  <span>{entry.japanese || "日本語訳なし"}</span>
                  <span>{entry.etymology || "構成なし"}</span>
                  {entry.meaning ? <span>{entry.meaning}</span> : null}
                  {entry.origin ? <span>{entry.origin}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          {invalidEntries.length > 0 ? (
            <div className="warning-box">
              <strong>解析できなかった行</strong>
              <div className="bulk-invalid-list">
                {invalidEntries.map((entry, index) => (
                  <code key={`${entry}-${index}`}>{entry}</code>
                ))}
              </div>
            </div>
          ) : null}

          <label className="full-width">
            <span>取り込み時の品詞</span>
            <select
              value={partOfSpeechId}
              onChange={(event) => onPartOfSpeechChange(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">未設定</option>
              {partsOfSpeech.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>
            キャンセル
          </button>
          <button type="button" onClick={onImport} disabled={parsedEntries.length === 0 || isSubmitting}>
            {isSubmitting ? "取り込み中..." : `${parsedEntries.length}件を取り込む`}
          </button>
        </div>
      </div>
    </div>
  );
}
