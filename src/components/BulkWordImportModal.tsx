import type { ParsedBulkWord } from "../lib/bulk-import";

type BulkWordImportModalProps = {
  isOpen: boolean;
  rawText: string;
  parsedEntries: ParsedBulkWord[];
  invalidEntries: string[];
  isSubmitting: boolean;
  onRawTextChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

export default function BulkWordImportModal({
  isOpen,
  rawText,
  parsedEntries,
  invalidEntries,
  isSubmitting,
  onRawTextChange,
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
            `単語（読み）　日本語訳　構成` の形で貼り付けます。複数行でも、1 行に連続して並べても扱えます。
          </p>
          <textarea
            className="bulk-input-textarea"
            rows={10}
            value={rawText}
            placeholder="例: ∂yaлэ（ダヤレ）　過去　∂ya（痕跡）+ лэ（保持）"
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
                  <span>{entry.japanese}</span>
                  <span>{entry.etymology || "構成なし"}</span>
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
