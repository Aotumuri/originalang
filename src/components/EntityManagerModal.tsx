import { useEffect, useState } from "react";
import type { ManagedEntity } from "../types";
import { createId } from "../lib/utils";

type DraftMap = Record<string, { name: string; description: string }>;

type EntityManagerModalProps = {
  title: string;
  createPrefix: string;
  isOpen: boolean;
  items: ManagedEntity[];
  onClose: () => void;
  onSave: (entity: Pick<ManagedEntity, "id" | "name" | "description">) => Promise<void>;
  onDelete: (entity: ManagedEntity) => Promise<void>;
};

export default function EntityManagerModal({
  title,
  createPrefix,
  isOpen,
  items,
  onClose,
  onSave,
  onDelete,
}: EntityManagerModalProps) {
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    const nextDrafts: DraftMap = {};
    for (const item of items) {
      nextDrafts[item.id] = {
        name: item.name,
        description: item.description,
      };
    }
    setDrafts(nextDrafts);
  }, [items]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="secondary-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="manager-section">
          <h3>新規追加</h3>
          <div className="manager-grid">
            <input
              placeholder="名前"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <textarea
              rows={3}
              placeholder="説明"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!newName.trim()) {
                return;
              }

              await onSave({
                id: createId(createPrefix),
                name: newName.trim(),
                description: newDescription.trim(),
              });
              setNewName("");
              setNewDescription("");
            }}
          >
            追加
          </button>
        </div>

        <div className="manager-section">
          <h3>既存項目</h3>
          <div className="manager-list">
            {items.map((item) => {
              const draft = drafts[item.id] ?? { name: item.name, description: item.description };
              return (
                <div className="manager-item" key={item.id}>
                  <div className="manager-grid">
                    <input
                      value={draft.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            ...draft,
                            name: value,
                          },
                        }));
                      }}
                    />
                    <textarea
                      rows={3}
                      value={draft.description}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            ...draft,
                            description: value,
                          },
                        }));
                      }}
                    />
                  </div>
                  <div className="manager-actions">
                    <span className="usage-chip">使用中: {item.usageCount}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!draft.name.trim()) {
                          return;
                        }
                        void onSave({
                          id: item.id,
                          name: draft.name.trim(),
                          description: draft.description.trim(),
                        });
                      }}
                    >
                      保存
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => onDelete(item)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
