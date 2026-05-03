import { useEffect, useRef } from "react";

type ResetDictionaryModalProps = {
  isOpen: boolean;
  confirmationText: string;
  isSubmitting: boolean;
  onConfirmationTextChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ResetDictionaryModal({
  isOpen,
  confirmationText,
  isSubmitting,
  onConfirmationTextChange,
  onClose,
  onConfirm,
}: ResetDictionaryModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const canSubmit = confirmationText === "RESET" && !isSubmitting;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel modal-panel-narrow" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>データ初期化の確認</h2>
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>
            閉じる
          </button>
        </div>

        <div className="modal-body">
          <p className="danger-text">
            この操作を実行すると、辞書データ全体を初期化します。
          </p>
          <ul className="danger-list">
            <li>単語</li>
            <li>使用例</li>
            <li>品詞</li>
            <li>カテゴリ</li>
            <li>構成要素</li>
          </ul>
          <p className="modal-help-text">操作前に JSON バックアップの作成を試みます。</p>
          <p className="modal-help-text">続行する場合は `RESET` と入力してください。</p>

          <input
            ref={inputRef}
            value={confirmationText}
            placeholder="RESET"
            onChange={(event) => onConfirmationTextChange(event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>
            キャンセル
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={!canSubmit}>
            {isSubmitting ? "初期化中..." : "初期化する"}
          </button>
        </div>
      </div>
    </div>
  );
}
