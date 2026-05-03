import type { WordComponentRecord, WordReference } from "../types";

type ComponentPatch = Partial<Pick<WordComponentRecord, "text" | "meaning" | "linkedWordId">>;

type WordComponentsEditorProps = {
  currentWordId: string;
  components: WordComponentRecord[];
  wordReferences: WordReference[];
  onExtractFromEtymology: () => void;
  onAdd: () => void;
  onUpdate: (componentId: string, patch: ComponentPatch) => void;
  onDelete: (componentId: string) => void;
  onOpenLinkedWord: (wordId: string) => void;
};

export default function WordComponentsEditor({
  currentWordId,
  components,
  wordReferences,
  onExtractFromEtymology,
  onAdd,
  onUpdate,
  onDelete,
  onOpenLinkedWord,
}: WordComponentsEditorProps) {
  return (
    <div className="full-width">
      <div className="subsection-header">
        <span>構成要素</span>
        <div className="inline-actions">
          <button className="secondary-button" type="button" onClick={onExtractFromEtymology}>
            構成欄から抽出
          </button>
          <button className="secondary-button" type="button" onClick={onAdd}>
            要素追加
          </button>
        </div>
      </div>

      <div className="examples-list">
        {components.length === 0 ? (
          <p className="empty-state">
            構成欄に `kar（固い・高い）+ ρа（広がる・存在）` のように書いて「構成欄から抽出」を押すか、手動で追加してください。
          </p>
        ) : null}

        {components.map((component) => (
          <div className="example-card" key={component.id}>
            <label>
              <span>要素表記</span>
              <input
                value={component.text}
                onChange={(event) => onUpdate(component.id, { text: event.target.value })}
              />
            </label>

            <label>
              <span>要素の意味</span>
              <input
                value={component.meaning}
                onChange={(event) => onUpdate(component.id, { meaning: event.target.value })}
              />
            </label>

            <label>
              <span>リンク先単語</span>
              <select
                value={component.linkedWordId ?? ""}
                onChange={(event) =>
                  onUpdate(component.id, { linkedWordId: event.target.value || null })
                }
              >
                <option value="">未設定</option>
                {wordReferences
                  .filter((reference) => reference.id !== currentWordId)
                  .map((reference) => (
                    <option key={reference.id} value={reference.id}>
                      {reference.text}
                      {reference.japanese ? ` / ${reference.japanese}` : ""}
                    </option>
                  ))}
              </select>
            </label>

            <div className="manager-actions">
              <button
                className="secondary-button"
                disabled={!component.linkedWordId}
                type="button"
                onClick={() => (component.linkedWordId ? onOpenLinkedWord(component.linkedWordId) : undefined)}
              >
                単語を開く
              </button>
              <button className="danger-button" type="button" onClick={() => onDelete(component.id)}>
                要素削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
