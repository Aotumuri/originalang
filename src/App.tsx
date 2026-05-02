import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import EntityManagerModal from "./components/EntityManagerModal";
import {
  BUILD_DIRECTORY_NAME,
  EXPORT_FILE_NAME,
} from "./constants";
import { buildTextBundle } from "./lib/build";
import {
  deleteCategory,
  deletePartOfSpeech,
  deleteWord,
  findDuplicateWords,
  getDictionaryExport,
  getWord,
  listCategories,
  listPartsOfSpeech,
  listWords,
  parseDictionaryImport,
  replaceDictionaryFromImport,
  resetDictionary,
  saveCategory,
  savePartOfSpeech,
  saveWord,
} from "./lib/repository";
import {
  backupFileName,
  createEmptyExample,
  createEmptyWordDraft,
  formatDateTime,
  removeWordListItem,
  sortWordList,
  toWordListItem,
  upsertWordList,
} from "./lib/utils";
import type {
  FlashMessage,
  ManagedEntity,
  SaveState,
  SearchFilters,
  WordDraft,
  WordListItem,
  WordRecord,
} from "./types";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return "同名の項目がすでに存在します。";
    }
    return error.message;
  }
  return "不明なエラーが発生しました。";
}

function enrichWord(
  word: WordRecord | WordDraft,
  partsOfSpeech: ManagedEntity[],
  categories: ManagedEntity[],
): WordDraft {
  const partOfSpeechName = word.partOfSpeechId
    ? partsOfSpeech.find((item) => item.id === word.partOfSpeechId)?.name ?? ""
    : "";
  const categoryNames = word.categoryIds
    .map((categoryId) => categories.find((item) => item.id === categoryId)?.name ?? "")
    .filter(Boolean);

  return {
    ...word,
    partOfSpeechName,
    categoryNames,
    isPersisted: "isPersisted" in word ? word.isPersisted : true,
  };
}

function statusLabel(status: SaveState): string {
  switch (status) {
    case "saving":
      return "保存中";
    case "error":
      return "保存エラー";
    default:
      return "保存済み";
  }
}

export default function App() {
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    query: "",
    partOfSpeechId: "",
    categoryId: "",
  });
  const deferredQuery = useDeferredValue(searchFilters.query);

  const [words, setWords] = useState<WordListItem[]>([]);
  const [partsOfSpeech, setPartsOfSpeech] = useState<ManagedEntity[]>([]);
  const [categories, setCategories] = useState<ManagedEntity[]>([]);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WordDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);
  const [duplicateWords, setDuplicateWords] = useState<WordListItem[]>([]);
  const [buildDirectoryPath, setBuildDirectoryPath] = useState("");
  const [managerMode, setManagerMode] = useState<"pos" | "category" | null>(null);

  const refreshTokenRef = useRef(0);
  const draftRef = useRef<WordDraft | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (!flashMessage) {
      return;
    }

    const timer = window.setTimeout(() => setFlashMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flashMessage]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        const [nextPartsOfSpeech, nextCategories] = await Promise.all([
          listPartsOfSpeech(),
          listCategories(),
        ]);
        setPartsOfSpeech(nextPartsOfSpeech);
        setCategories(nextCategories);
      } catch (error) {
        setFlashMessage({
          tone: "error",
          text: toErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialData();
  }, []);

  useEffect(() => {
    const nextFilters = {
      ...searchFilters,
      query: deferredQuery,
    };

    const token = refreshTokenRef.current + 1;
    refreshTokenRef.current = token;

    const loadWords = async () => {
      try {
        const nextWords = await listWords(nextFilters);
        if (refreshTokenRef.current !== token) {
          return;
        }
        startTransition(() => {
          setWords(nextWords);
        });
      } catch (error) {
        setFlashMessage({
          tone: "error",
          text: toErrorMessage(error),
        });
      }
    };

    void loadWords();
  }, [deferredQuery, searchFilters.partOfSpeechId, searchFilters.categoryId]);

  useEffect(() => {
    if (!draft?.text.trim()) {
      setDuplicateWords([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const duplicates = await findDuplicateWords(draft.text, draft.id);
        setDuplicateWords(duplicates);
      } catch {
        setDuplicateWords([]);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [draft?.id, draft?.text]);

  useEffect(() => {
    if (!draft) {
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }
      return enrichWord(current, partsOfSpeech, categories);
    });
  }, [partsOfSpeech, categories]);

  useEffect(() => {
    if (draft || words.length === 0 || selectedWordId) {
      return;
    }
    void loadWordIntoEditor(words[0].id);
  }, [draft, selectedWordId, words]);

  async function refreshTaxonomies(): Promise<void> {
    const [nextPartsOfSpeech, nextCategories] = await Promise.all([
      listPartsOfSpeech(),
      listCategories(),
    ]);
    setPartsOfSpeech(nextPartsOfSpeech);
    setCategories(nextCategories);
  }

  async function refreshWordList(): Promise<void> {
    const nextWords = await listWords({
      ...searchFilters,
      query: deferredQuery,
    });
    setWords(nextWords);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([refreshTaxonomies(), refreshWordList()]);
  }

  async function loadWordIntoEditor(wordId: string): Promise<void> {
    const word = await getWord(wordId);
    setSelectedWordId(wordId);
    setDraft(word ? enrichWord(word, partsOfSpeech, categories) : null);
    setIsDirty(false);
    setSaveState("saved");
    setStatusMessage("");
  }

  function updateDraft(updater: (current: WordDraft) => WordDraft): void {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
    setIsDirty(true);
  }

  async function persistCurrentDraft(): Promise<boolean> {
    const currentDraft = draftRef.current;
    if (!currentDraft) {
      return true;
    }

    if (!currentDraft.text.trim()) {
      setSaveState("error");
      setStatusMessage("言語表記は必須です。");
      return false;
    }

    setSaveState("saving");
    setStatusMessage("");

    try {
      const { isPersisted: _ignored, ...record } = currentDraft;
      const saved = await saveWord(record);
      const refreshed = await getWord(saved.id);
      const nextDraft = refreshed
        ? enrichWord(refreshed, partsOfSpeech, categories)
        : enrichWord({ ...saved, isPersisted: true }, partsOfSpeech, categories);

      setDraft(nextDraft);
      setSelectedWordId(nextDraft.id);
      setWords((current) => upsertWordList(current, toWordListItem(nextDraft)));
      setIsDirty(false);
      setSaveState("saved");
      setStatusMessage("保存しました。");
      await refreshTaxonomies();
      await refreshWordList();
      return true;
    } catch (error) {
      setSaveState("error");
      setStatusMessage(toErrorMessage(error));
      return false;
    }
  }

  async function ensureDraftSaved(): Promise<boolean> {
    const currentDraft = draftRef.current;
    if (!currentDraft || !isDirty) {
      return true;
    }

    if (!currentDraft.isPersisted && !currentDraft.text.trim()) {
      return window.confirm("未保存の新規単語を破棄しますか？");
    }

    const saved = await persistCurrentDraft();
    if (saved) {
      return true;
    }

    return window.confirm("保存に失敗しました。変更を破棄して続けますか？");
  }

  async function handleSelectWord(wordId: string): Promise<void> {
    if (wordId === selectedWordId && draft?.isPersisted) {
      return;
    }

    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    if (!draft?.isPersisted && !draft?.text.trim()) {
      setDraft(null);
    }

    await loadWordIntoEditor(wordId);
  }

  async function handleCreateWord(): Promise<void> {
    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    const nextDraft = createEmptyWordDraft();
    setDraft(nextDraft);
    setSelectedWordId(nextDraft.id);
    setIsDirty(false);
    setSaveState("saved");
    setStatusMessage("");
  }

  async function handleDeleteWord(): Promise<void> {
    if (!draft) {
      return;
    }

    const confirmed = window.confirm(`「${draft.text || "未入力"}」を削除しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      if (draft.isPersisted) {
        await deleteWord(draft.id);
      }
      setWords((current) => removeWordListItem(current, draft.id));
      setDraft(null);
      setSelectedWordId(null);
      setIsDirty(false);
      setFlashMessage({
        tone: "success",
        text: "単語を削除しました。",
      });
      await refreshTaxonomies();
      await refreshWordList();
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

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
      setFlashMessage({
        tone: "success",
        text: `JSON を書き出しました: ${path}`,
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
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
      setFlashMessage({
        tone: "success",
        text: "JSON をインポートしました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
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
      setFlashMessage({
        tone: "success",
        text: `バックアップを作成しました: ${backupPath}`,
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
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
      setFlashMessage({
        tone: "success",
        text: "データを初期化しました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
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
      setFlashMessage({
        tone: "success",
        text: `Build completed: ${result.relativePath}`,
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  async function handleOpenBuildFolder(): Promise<void> {
    try {
      const target =
        buildDirectoryPath || (await join(await appDataDir(), BUILD_DIRECTORY_NAME));
      await revealItemInDir(target);
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  async function handleSavePartOfSpeech(
    entity: Pick<ManagedEntity, "id" | "name" | "description">,
  ): Promise<void> {
    try {
      await savePartOfSpeech(entity);
      await refreshAll();
      setFlashMessage({
        tone: "success",
        text: "品詞を保存しました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  async function handleDeletePartOfSpeech(entity: ManagedEntity): Promise<void> {
    if (entity.usageCount > 0) {
      setFlashMessage({
        tone: "error",
        text: `「${entity.name}」は ${entity.usageCount} 件の単語で使用中のため削除できません。`,
      });
      return;
    }

    const confirmed = window.confirm(`品詞「${entity.name}」を削除しますか？`);
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
      setFlashMessage({
        tone: "success",
        text: "品詞を削除しました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  async function handleSaveCategory(
    entity: Pick<ManagedEntity, "id" | "name" | "description">,
  ): Promise<void> {
    try {
      await saveCategory(entity);
      await refreshAll();
      setFlashMessage({
        tone: "success",
        text: "カテゴリを保存しました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  async function handleDeleteCategory(entity: ManagedEntity): Promise<void> {
    const confirmed = window.confirm(
      entity.usageCount > 0
        ? `カテゴリ「${entity.name}」は ${entity.usageCount} 件の単語で使われています。削除すると関連付けも外れます。続行しますか？`
        : `カテゴリ「${entity.name}」を削除しますか？`,
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
      setFlashMessage({
        tone: "success",
        text: "カテゴリを削除しました。",
      });
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  const renderedWords = (() => {
    if (!draft) {
      return words;
    }

    if (!draft.isPersisted || isDirty || !words.some((word) => word.id === draft.id)) {
      return sortWordList([
        toWordListItem(draft),
        ...words.filter((word) => word.id !== draft.id),
      ]);
    }

    return words;
  })();

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar-main">
          <input
            className="search-input"
            placeholder="検索"
            value={searchFilters.query}
            onChange={(event) =>
              setSearchFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
          />
          <select
            value={searchFilters.partOfSpeechId}
            onChange={(event) =>
              setSearchFilters((current) => ({
                ...current,
                partOfSpeechId: event.target.value,
              }))
            }
          >
            <option value="">品詞: すべて</option>
            {partsOfSpeech.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={searchFilters.categoryId}
            onChange={(event) =>
              setSearchFilters((current) => ({
                ...current,
                categoryId: event.target.value,
              }))
            }
          >
            <option value="">カテゴリ: すべて</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-actions">
          <button type="button" onClick={() => void handleCreateWord()}>
            単語追加
          </button>
          <button type="button" onClick={() => setManagerMode("pos")}>
            品詞管理
          </button>
          <button type="button" onClick={() => setManagerMode("category")}>
            カテゴリ管理
          </button>
          <button type="button" onClick={() => void handleExportJson()}>
            JSONエクスポート
          </button>
          <button type="button" onClick={() => void handleImportJson()}>
            JSONインポート
          </button>
          <button type="button" onClick={() => void handleBackup()}>
            バックアップ作成
          </button>
          <button type="button" onClick={() => void handleResetDictionary()}>
            データ初期化
          </button>
          <button type="button" onClick={() => void handleBuild()}>
            Build TXT
          </button>
          <button className="secondary-button" type="button" onClick={() => void handleOpenBuildFolder()}>
            Buildを開く
          </button>
        </div>

        <div className="toolbar-status">
          <span className={`status-badge status-${saveState}`}>{statusLabel(saveState)}</span>
          <span className="word-count">単語数: {words.length}</span>
          {isDirty ? <span className="dirty-badge">未保存の変更あり</span> : null}
          {statusMessage ? <span className="status-text">{statusMessage}</span> : null}
        </div>
      </header>

      {flashMessage ? (
        <div className={`flash-message flash-${flashMessage.tone}`}>{flashMessage.text}</div>
      ) : null}

      <main className="content-grid">
        <aside className="word-list-panel">
          <div className="panel-heading">
            <h2>単語一覧</h2>
            <span>{renderedWords.length} 件</span>
          </div>
          <div className="word-list">
            {isLoading ? <p className="empty-state">読み込み中...</p> : null}
            {!isLoading && renderedWords.length === 0 ? (
              <p className="empty-state">単語がありません。</p>
            ) : null}
            {renderedWords.map((word) => (
              <button
                className={`word-row ${selectedWordId === word.id ? "selected" : ""}`}
                key={word.id}
                type="button"
                onClick={() => void handleSelectWord(word.id)}
              >
                <div className="word-row-top">
                  <strong>{word.text || "(未入力)"}</strong>
                  {word.isDraft ? <span className="draft-chip">新規</span> : null}
                </div>
                <div className="word-row-sub">{word.japanese || "日本語訳なし"}</div>
                <div className="word-row-meta">
                  <span>{word.partOfSpeechName || "品詞未設定"}</span>
                  <span>{formatDateTime(word.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-panel">
          {draft ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{draft.text || "新規単語"}</h2>
                  <span>最終更新: {formatDateTime(draft.updatedAt)}</span>
                </div>
                <div className="editor-actions">
                  <button type="button" onClick={() => void persistCurrentDraft()}>
                    保存
                  </button>
                  <button className="danger-button" type="button" onClick={() => void handleDeleteWord()}>
                    削除
                  </button>
                </div>
              </div>

              {!draft.text.trim() ? (
                <p className="warning-text">言語表記は必須です。</p>
              ) : null}
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
                  <input
                    value={draft.text}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        text: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>発音</span>
                  <input
                    value={draft.pronunciation}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        pronunciation: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>日本語訳</span>
                  <input
                    value={draft.japanese}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        japanese: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>品詞</span>
                  <select
                    value={draft.partOfSpeechId ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        partOfSpeechId: event.target.value || null,
                        partOfSpeechName:
                          partsOfSpeech.find((item) => item.id === event.target.value)?.name ?? "",
                      }))
                    }
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
                    {categories.map((category) => {
                      const checked = draft.categoryIds.includes(category.id);
                      return (
                        <label className="checkbox-item" key={category.id}>
                          <input
                            checked={checked}
                            type="checkbox"
                            onChange={(event) => {
                              const nextCategoryIds = event.target.checked
                                ? [...draft.categoryIds, category.id]
                                : draft.categoryIds.filter((categoryId) => categoryId !== category.id);
                              updateDraft((current) => ({
                                ...current,
                                categoryIds: nextCategoryIds,
                                categoryNames: nextCategoryIds
                                  .map((categoryId) => categories.find((item) => item.id === categoryId)?.name ?? "")
                                  .filter(Boolean),
                              }));
                            }}
                          />
                          <span>{category.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className="full-width">
                  <span>構成</span>
                  <textarea
                    rows={4}
                    value={draft.etymology}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        etymology: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="full-width">
                  <span>意味</span>
                  <textarea
                    rows={5}
                    value={draft.meaning}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        meaning: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="full-width">
                  <span>由来</span>
                  <textarea
                    rows={5}
                    value={draft.origin}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        origin: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="full-width">
                  <span>メモ</span>
                  <textarea
                    rows={5}
                    value={draft.notes}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="full-width">
                  <div className="subsection-header">
                    <span>使用例</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        updateDraft((current) => ({
                          ...current,
                          examples: [
                            ...current.examples,
                            createEmptyExample(current.id, current.examples.length),
                          ],
                        }))
                      }
                    >
                      使用例追加
                    </button>
                  </div>

                  <div className="examples-list">
                    {draft.examples.length === 0 ? (
                      <p className="empty-state">使用例はまだありません。</p>
                    ) : null}
                    {draft.examples.map((example, index) => (
                      <div className="example-card" key={example.id}>
                        <label>
                          <span>使用例</span>
                          <textarea
                            rows={3}
                            value={example.text}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                examples: current.examples.map((item) =>
                                  item.id === example.id
                                    ? { ...item, text: event.target.value, sortOrder: index }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>使用例の訳</span>
                          <textarea
                            rows={2}
                            value={example.translation}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                examples: current.examples.map((item) =>
                                  item.id === example.id
                                    ? { ...item, translation: event.target.value, sortOrder: index }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>補足メモ</span>
                          <textarea
                            rows={2}
                            value={example.note}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                examples: current.examples.map((item) =>
                                  item.id === example.id
                                    ? { ...item, note: event.target.value, sortOrder: index }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              examples: current.examples
                                .filter((item) => item.id !== example.id)
                                .map((item, nextIndex) => ({
                                  ...item,
                                  sortOrder: nextIndex,
                                })),
                            }))
                          }
                        >
                          使用例削除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-editor">
              <h2>単語を選択してください</h2>
              <p>左側の一覧から単語を選択するか、「単語追加」で新しい単語を作成します。</p>
            </div>
          )}
        </section>
      </main>

      <EntityManagerModal
        createPrefix="pos"
        isOpen={managerMode === "pos"}
        items={partsOfSpeech}
        title="品詞管理"
        onClose={() => setManagerMode(null)}
        onDelete={(entity) => handleDeletePartOfSpeech(entity)}
        onSave={(entity) => handleSavePartOfSpeech(entity)}
      />

      <EntityManagerModal
        createPrefix="category"
        isOpen={managerMode === "category"}
        items={categories}
        title="カテゴリ管理"
        onClose={() => setManagerMode(null)}
        onDelete={(entity) => handleDeleteCategory(entity)}
        onSave={(entity) => handleSaveCategory(entity)}
      />
    </div>
  );
}
