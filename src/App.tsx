import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import AppToolbar from "./components/AppToolbar";
import BulkWordImportModal from "./components/BulkWordImportModal";
import EntityManagerModal from "./components/EntityManagerModal";
import ResetDictionaryModal from "./components/ResetDictionaryModal";
import WordEditorPane from "./components/WordEditorPane";
import WordListPane from "./components/WordListPane";
import { parseBulkImportText, toBulkImportedWord } from "./lib/bulk-import";
import {
  createEmptyComponent,
  extractComponentsFromEtymology,
  formatComponentsAsEtymology,
} from "./lib/etymology";
import { createDictionaryFileActions } from "./lib/dictionary-file-actions";
import { createDictionaryTaxonomyActions } from "./lib/dictionary-taxonomy-actions";
import {
  deleteWord,
  findDuplicateWords,
  getWord,
  listAllWordReferences,
  listCategories,
  listPartsOfSpeech,
  listWords,
  saveWord,
} from "./lib/repository";
import {
  createEmptyExample,
  createEmptyWordDraft,
  removeWordListItem,
  toWordListItem,
  upsertWordList,
} from "./lib/utils";
import {
  enrichWord,
  getRenderedWords,
  toErrorMessage,
} from "./lib/word-editor";
import type {
  ExampleRecord,
  FlashMessage,
  ManagedEntity,
  SaveState,
  SearchFilters,
  WordComponentRecord,
  WordDraft,
  WordListItem,
  WordReference,
  WordRecord,
} from "./types";

export default function App() {
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    query: "",
    partOfSpeechId: "",
    categoryId: "",
  });
  const deferredQuery = useDeferredValue(searchFilters.query);

  const [words, setWords] = useState<WordListItem[]>([]);
  const [wordReferences, setWordReferences] = useState<WordReference[]>([]);
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState("");
  const [isResettingDictionary, setIsResettingDictionary] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);

  const refreshTokenRef = useRef(0);
  const draftRef = useRef<WordDraft | null>(null);
  draftRef.current = draft;
  const bulkImportResult = parseBulkImportText(bulkImportText);

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
        const [nextPartsOfSpeech, nextCategories, nextWordReferences] = await Promise.all([
          listPartsOfSpeech(),
          listCategories(),
          listAllWordReferences(),
        ]);
        setPartsOfSpeech(nextPartsOfSpeech);
        setCategories(nextCategories);
        setWordReferences(nextWordReferences);
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

  async function refreshTaxonomies(): Promise<void> {
    const [nextPartsOfSpeech, nextCategories] = await Promise.all([
      listPartsOfSpeech(),
      listCategories(),
    ]);
    setPartsOfSpeech(nextPartsOfSpeech);
    setCategories(nextCategories);
  }

  async function refreshWordReferences(): Promise<void> {
    const nextWordReferences = await listAllWordReferences();
    setWordReferences(nextWordReferences);
  }

  async function refreshWordList(): Promise<void> {
    const nextWords = await listWords({
      ...searchFilters,
      query: deferredQuery,
    });
    setWords(nextWords);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([refreshTaxonomies(), refreshWordList(), refreshWordReferences()]);
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

  function handleFieldChange(
    field: keyof Pick<
      WordDraft,
      "text" | "pronunciation" | "japanese" | "etymology" | "meaning" | "origin" | "notes"
    >,
    value: string,
  ): void {
    updateDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handlePartOfSpeechChange(partOfSpeechId: string): void {
    updateDraft((current) => ({
      ...current,
      partOfSpeechId: partOfSpeechId || null,
      partOfSpeechName:
        partsOfSpeech.find((item) => item.id === partOfSpeechId)?.name ?? "",
    }));
  }

  function handleCategoryToggle(categoryId: string, checked: boolean): void {
    updateDraft((current) => {
      const nextCategoryIds = checked
        ? [...current.categoryIds, categoryId]
        : current.categoryIds.filter((id) => id !== categoryId);

      return {
        ...current,
        categoryIds: nextCategoryIds,
        categoryNames: nextCategoryIds
          .map((id) => categories.find((item) => item.id === id)?.name ?? "")
          .filter(Boolean),
      };
    });
  }

  function syncComponentsFromEtymology(): void {
    updateDraft((current) => ({
      ...current,
      components: extractComponentsFromEtymology(current.id, current.etymology, current.components),
    }));
  }

  function updateComponentList(
    updater: (components: WordDraft["components"], current: WordDraft) => WordDraft["components"],
  ): void {
    updateDraft((current) => {
      const nextComponents = updater(current.components, current).map((component, index) => ({
        ...component,
        wordId: current.id,
        sortOrder: index,
      }));

      return {
        ...current,
        components: nextComponents,
        etymology: formatComponentsAsEtymology(nextComponents),
      };
    });
  }

  function handleAddComponent(): void {
    updateComponentList((components, current) => [
      ...components,
      createEmptyComponent(current.id, components.length),
    ]);
  }

  function handleUpdateComponent(
    componentId: string,
    patch: Partial<Pick<WordComponentRecord, "text" | "meaning" | "linkedWordId">>,
  ): void {
    updateComponentList((components) =>
      components.map((component) =>
        component.id === componentId ? { ...component, ...patch } : component,
      ),
    );
  }

  function handleDeleteComponent(componentId: string): void {
    updateComponentList((components) =>
      components.filter((component) => component.id !== componentId),
    );
  }

  function handleAddExample(): void {
    updateDraft((current) => ({
      ...current,
      examples: [
        ...current.examples,
        createEmptyExample(current.id, current.examples.length),
      ],
    }));
  }

  function handleUpdateExample(
    exampleId: string,
    patch: Partial<Pick<ExampleRecord, "text" | "translation" | "note">>,
  ): void {
    updateDraft((current) => ({
      ...current,
      examples: current.examples.map((example, index) =>
        example.id === exampleId ? { ...example, ...patch, sortOrder: index } : example,
      ),
    }));
  }

  function handleDeleteExample(exampleId: string): void {
    updateDraft((current) => ({
      ...current,
      examples: current.examples
        .filter((example) => example.id !== exampleId)
        .map((example, index) => ({
          ...example,
          sortOrder: index,
        })),
    }));
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
      await refreshWordReferences();
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
      return confirmDialog("未保存の新規単語を破棄しますか？", {
        title: "未保存の変更",
        kind: "warning",
      });
    }

    const saved = await persistCurrentDraft();
    if (saved) {
      return true;
    }

    return confirmDialog("保存に失敗しました。変更を破棄して続けますか？", {
      title: "保存失敗",
      kind: "warning",
    });
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

  async function handleClearSelection(): Promise<void> {
    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    setDraft(null);
    setSelectedWordId(null);
    setIsDirty(false);
    setSaveState("saved");
    setStatusMessage("");
    setDuplicateWords([]);
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

  function handleOpenBulkImportModal(): void {
    setIsBulkImportModalOpen(true);
  }

  function handleCloseBulkImportModal(): void {
    if (isBulkImporting) {
      return;
    }
    setIsBulkImportModalOpen(false);
  }

  async function handleBulkImport(): Promise<void> {
    if (bulkImportResult.entries.length === 0) {
      return;
    }

    const canContinue = await ensureDraftSaved();
    if (!canContinue) {
      return;
    }

    setIsBulkImporting(true);
    setSaveState("saving");
    setStatusMessage("");

    try {
      for (const entry of bulkImportResult.entries) {
        await saveWord(toBulkImportedWord(entry));
      }

      await refreshAll();
      await loadWordIntoEditor(bulkImportResult.entries[0].id);
      setBulkImportText("");
      setIsBulkImportModalOpen(false);
      setSaveState("saved");
      setStatusMessage("保存しました。");
      setFlashMessage({
        tone: bulkImportResult.invalidEntries.length > 0 ? "info" : "success",
        text:
          bulkImportResult.invalidEntries.length > 0
            ? `${bulkImportResult.entries.length}件を取り込みました。${bulkImportResult.invalidEntries.length}件は解析できませんでした。`
            : `${bulkImportResult.entries.length}件を取り込みました。`,
      });
    } catch (error) {
      setSaveState("error");
      setStatusMessage(toErrorMessage(error));
      setFlashMessage({
        tone: "error",
        text: `一括入力に失敗しました: ${toErrorMessage(error)}`,
      });
    } finally {
      setIsBulkImporting(false);
    }
  }

  async function handleDeleteWord(): Promise<void> {
    if (!draft) {
      return;
    }

    const confirmed = await confirmDialog(`「${draft.text || "未入力"}」を削除しますか？`, {
      title: "単語削除",
      kind: "warning",
    });
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
      await refreshWordReferences();
    } catch (error) {
      setFlashMessage({
        tone: "error",
        text: toErrorMessage(error),
      });
    }
  }

  function handleOpenResetModal(): void {
    setResetConfirmationText("");
    setIsResetModalOpen(true);
  }

  function handleCloseResetModal(): void {
    if (isResettingDictionary) {
      return;
    }
    setIsResetModalOpen(false);
    setResetConfirmationText("");
  }

  async function handleConfirmResetDictionary(): Promise<void> {
    if (resetConfirmationText !== "RESET") {
      return;
    }

    setIsResettingDictionary(true);
    try {
      const didReset = await fileActions.handleResetDictionary();
      if (didReset) {
        setIsResetModalOpen(false);
        setResetConfirmationText("");
      }
    } finally {
      setIsResettingDictionary(false);
    }
  }

  const fileActions = createDictionaryFileActions({
    ensureDraftSaved,
    refreshAll,
    setDraft,
    setSelectedWordId,
    setIsDirty,
    setBuildDirectoryPath,
    setFlashMessage: (message) => setFlashMessage(message),
  });

  const taxonomyActions = createDictionaryTaxonomyActions({
    draft,
    updateDraft,
    refreshAll,
    setFlashMessage: (message) => setFlashMessage(message),
  });

  const renderedWords = getRenderedWords(words, draft, isDirty);

  return (
    <div className="app-shell">
      <AppToolbar
        categories={categories}
        isDirty={isDirty}
        onBackup={() => void fileActions.handleBackup()}
        onBuild={() => void fileActions.handleBuild()}
        onCreateWord={() => void handleCreateWord()}
        onExportJson={() => void fileActions.handleExportJson()}
        onImportJson={() => void fileActions.handleImportJson()}
        onOpenBulkImport={handleOpenBulkImportModal}
        onOpenBuildFolder={() => void fileActions.handleOpenBuildFolder(buildDirectoryPath)}
        onOpenCategoryManager={() => setManagerMode("category")}
        onOpenPartOfSpeechManager={() => setManagerMode("pos")}
        onResetDictionary={handleOpenResetModal}
        onSearchFiltersChange={setSearchFilters}
        partsOfSpeech={partsOfSpeech}
        saveState={saveState}
        searchFilters={searchFilters}
        statusMessage={statusMessage}
        wordCount={words.length}
      />

      {flashMessage ? (
        <div className={`flash-message flash-${flashMessage.tone}`}>{flashMessage.text}</div>
      ) : null}

      <main className="content-grid">
        <WordListPane
          isLoading={isLoading}
          onClearSelection={() => void handleClearSelection()}
          onSelectWord={(wordId) => void handleSelectWord(wordId)}
          selectedWordId={selectedWordId}
          words={renderedWords}
        />

        <WordEditorPane
          categories={categories}
          draft={draft}
          duplicateWords={duplicateWords}
          onAddComponent={handleAddComponent}
          onAddExample={handleAddExample}
          onCategoryToggle={handleCategoryToggle}
          onDelete={() => void handleDeleteWord()}
          onDeleteComponent={handleDeleteComponent}
          onDeleteExample={handleDeleteExample}
          onExtractComponents={syncComponentsFromEtymology}
          onFieldChange={handleFieldChange}
          onOpenLinkedWord={(wordId) => void handleSelectWord(wordId)}
          onPartOfSpeechChange={handlePartOfSpeechChange}
          onSave={() => void persistCurrentDraft()}
          onUpdateComponent={handleUpdateComponent}
          onUpdateExample={handleUpdateExample}
          partsOfSpeech={partsOfSpeech}
          wordReferences={wordReferences}
        />
      </main>

      <EntityManagerModal
        createPrefix="pos"
        isOpen={managerMode === "pos"}
        items={partsOfSpeech}
        title="品詞管理"
        onClose={() => setManagerMode(null)}
        onDelete={(entity) => taxonomyActions.handleDeletePartOfSpeech(entity)}
        onSave={(entity) => taxonomyActions.handleSavePartOfSpeech(entity)}
      />

      <EntityManagerModal
        createPrefix="category"
        isOpen={managerMode === "category"}
        items={categories}
        title="カテゴリ管理"
        onClose={() => setManagerMode(null)}
        onDelete={(entity) => taxonomyActions.handleDeleteCategory(entity)}
        onSave={(entity) => taxonomyActions.handleSaveCategory(entity)}
      />

      <BulkWordImportModal
        invalidEntries={bulkImportResult.invalidEntries}
        isOpen={isBulkImportModalOpen}
        isSubmitting={isBulkImporting}
        parsedEntries={bulkImportResult.entries}
        rawText={bulkImportText}
        onClose={handleCloseBulkImportModal}
        onImport={() => void handleBulkImport()}
        onRawTextChange={setBulkImportText}
      />

      <ResetDictionaryModal
        confirmationText={resetConfirmationText}
        isOpen={isResetModalOpen}
        isSubmitting={isResettingDictionary}
        onClose={handleCloseResetModal}
        onConfirm={() => void handleConfirmResetDictionary()}
        onConfirmationTextChange={setResetConfirmationText}
      />
    </div>
  );
}
