import { appDataDir, join } from "@tauri-apps/api/path";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { BUILD_DIRECTORY_NAME, EXPORT_FILE_NAME } from "../constants";
import type { FlashMessage, WordDraft } from "../types";
import { buildTextBundle } from "./build";
import {
  getDictionaryExport,
  parseDictionaryImport,
  replaceDictionaryFromImport,
  resetDictionary,
} from "./repository";
import { backupFileName } from "./utils";
import { createFlashMessage, toErrorMessage } from "./word-editor";

type DictionaryFileActionDeps = {
  ensureDraftSaved: () => Promise<boolean>;
  refreshAll: () => Promise<void>;
  setDraft: (draft: WordDraft | null) => void;
  setSelectedWordId: (wordId: string | null) => void;
  setIsDirty: (isDirty: boolean) => void;
  setBuildDirectoryPath: (path: string) => void;
  setFlashMessage: (message: FlashMessage) => void;
};

export function createDictionaryFileActions({
  ensureDraftSaved,
  refreshAll,
  setDraft,
  setSelectedWordId,
  setIsDirty,
  setBuildDirectoryPath,
  setFlashMessage,
}: DictionaryFileActionDeps) {
  async function handleExportJson(): Promise<void> {
    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    try {
      const exportData = await getDictionaryExport();
      const path = await saveDialog({
        defaultPath: EXPORT_FILE_NAME,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (!path) {
        return;
      }

      await writeTextFile(path, JSON.stringify(exportData, null, 2));
      setFlashMessage(createFlashMessage("success", `JSON を書き出しました: ${path}`));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleImportJson(): Promise<void> {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path || Array.isArray(path)) {
      return;
    }

    const confirmed = window.confirm("現在のDB内容を置き換えて JSON をインポートします。続行しますか？");
    if (!confirmed) {
      return;
    }

    try {
      const content = await readTextFile(path);
      const parsed = parseDictionaryImport(content);
      await replaceDictionaryFromImport(parsed);
      setDraft(null);
      setSelectedWordId(null);
      setIsDirty(false);
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "JSON をインポートしました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleBackup(): Promise<void> {
    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    try {
      const exportData = await getDictionaryExport();
      const fileName = backupFileName();
      await mkdir("backups", { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(`backups/${fileName}`, JSON.stringify(exportData, null, 2), {
        baseDir: BaseDirectory.AppData,
      });
      const backupPath = await join(await appDataDir(), "backups", fileName);
      setFlashMessage(
        createFlashMessage("success", `バックアップを作成しました: ${backupPath}`),
      );
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleResetDictionary(): Promise<void> {
    const confirmed = window.confirm("辞書データを初期化します。単語は削除されます。続行しますか？");
    if (!confirmed) {
      return;
    }

    try {
      await resetDictionary();
      setDraft(null);
      setSelectedWordId(null);
      setIsDirty(false);
      await refreshAll();
      setFlashMessage(createFlashMessage("success", "データを初期化しました。"));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleBuild(): Promise<void> {
    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    try {
      const result = await buildTextBundle();
      setBuildDirectoryPath(result.absolutePath);
      setFlashMessage(createFlashMessage("success", `Build completed: ${result.relativePath}`));
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  async function handleOpenBuildFolder(buildDirectoryPath: string): Promise<void> {
    try {
      const target = buildDirectoryPath || (await join(await appDataDir(), BUILD_DIRECTORY_NAME));
      await revealItemInDir(target);
    } catch (error) {
      setFlashMessage(createFlashMessage("error", toErrorMessage(error)));
    }
  }

  return {
    handleExportJson,
    handleImportJson,
    handleBackup,
    handleResetDictionary,
    handleBuild,
    handleOpenBuildFolder,
  };
}
