import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import type { FlashMessage, ManagedEntity, WordDraft } from "../types";
import {
  deleteCategory,
  deletePartOfSpeech,
  saveCategory,
  savePartOfSpeech,
} from "./repository";
import { createFlashMessage, toErrorMessage } from "./word-editor";

type DictionaryTaxonomyActionDeps = {
  draft: WordDraft | null;
  updateDraft: (updater: (current: WordDraft) => WordDraft) => void;
  refreshAll: () => Promise<void>;
  setFlashMessage: (message: FlashMessage) => void;
};

export function createDictionaryTaxonomyActions({
  draft,
  updateDraft,
  refreshAll,
  setFlashMessage,
}: DictionaryTaxonomyActionDeps) {
  async function handleSavePartOfSpeech(
    entity: Pick<ManagedEntity, "id" | "name" | "description">,
  ): Promise<void> {
    try {
      await savePartOfSpeech(entity);
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "品詞を保存しました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleDeletePartOfSpeech(entity: ManagedEntity): Promise<void> {
    if (entity.usageCount > 0) {
      setFlashMessage(
        createFlashMessage(
          "error",
          `「${entity.name}」は ${entity.usageCount} 件の単語で使用中のため削除できません。`,
        ),
      );
      return;
    }

    const confirmed = await confirmDialog(`品詞「${entity.name}」を削除しますか？`, {
      title: "品詞削除",
      kind: "warning",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deletePartOfSpeech(entity.id);
      if (draft?.partOfSpeechId === entity.id) {
        updateDraft((current) => ({
          ...current,
          partOfSpeechId: null,
          partOfSpeechName: "",
        }));
      }
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "品詞を削除しました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleSaveCategory(
    entity: Pick<ManagedEntity, "id" | "name" | "description">,
  ): Promise<void> {
    try {
      await saveCategory(entity);
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "カテゴリを保存しました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleDeleteCategory(entity: ManagedEntity): Promise<void> {
    const confirmed = await confirmDialog(
      entity.usageCount > 0
        ? `カテゴリ「${entity.name}」は ${entity.usageCount} 件の単語で使われています。削除すると関連付けも外れます。続行しますか？`
        : `カテゴリ「${entity.name}」を削除しますか？`,
      {
        title: "カテゴリ削除",
        kind: "warning",
      },
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteCategory(entity.id);
      if (draft?.categoryIds.includes(entity.id)) {
        updateDraft((current) => ({
          ...current,
          categoryIds: current.categoryIds.filter((categoryId) => categoryId !== entity.id),
          categoryNames: current.categoryNames.filter((name) => name !== entity.name),
        }));
      }
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "カテゴリを削除しました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  return {
    handleSavePartOfSpeech,
    handleDeletePartOfSpeech,
    handleSaveCategory,
    handleDeleteCategory,
  };
}
