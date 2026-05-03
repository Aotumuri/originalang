import type { ExampleRecord } from "../types";

type ExamplePatch = Partial<Pick<ExampleRecord, "text" | "translation" | "note">>;

type ExamplesEditorProps = {
  examples: ExampleRecord[];
  onAdd: () => void;
  onUpdate: (exampleId: string, patch: ExamplePatch) => void;
  onDelete: (exampleId: string) => void;
};

export default function ExamplesEditor({
  examples,
  onAdd,
  onUpdate,
  onDelete,
}: ExamplesEditorProps) {
  return (
    <div className="full-width">
      <div className="subsection-header">
        <span>使用例</span>
        <button className="secondary-button" type="button" onClick={onAdd}>
          使用例追加
        </button>
      </div>

      <div className="examples-list">
        {examples.length === 0 ? <p className="empty-state">使用例はまだありません。</p> : null}
        {examples.map((example) => (
          <div className="example-card" key={example.id}>
            <label>
              <span>使用例</span>
              <textarea
                rows={3}
                value={example.text}
                onChange={(event) => onUpdate(example.id, { text: event.target.value })}
              />
            </label>
            <label>
              <span>使用例の訳</span>
              <textarea
                rows={2}
                value={example.translation}
                onChange={(event) => onUpdate(example.id, { translation: event.target.value })}
              />
            </label>
            <label>
              <span>補足メモ</span>
              <textarea
                rows={2}
                value={example.note}
                onChange={(event) => onUpdate(example.id, { note: event.target.value })}
              />
            </label>
            <button className="danger-button" type="button" onClick={() => onDelete(example.id)}>
              使用例削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
