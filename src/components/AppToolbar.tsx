import type { ManagedEntity, SaveState, SearchFilters } from "../types";
import { statusLabel } from "../lib/word-editor";

type AppToolbarProps = {
  searchFilters: SearchFilters;
  partsOfSpeech: ManagedEntity[];
  categories: ManagedEntity[];
  saveState: SaveState;
  wordCount: number;
  isDirty: boolean;
  statusMessage: string;
  onSearchFiltersChange: (updater: (current: SearchFilters) => SearchFilters) => void;
  onCreateWord: () => void;
  onOpenPartOfSpeechManager: () => void;
  onOpenCategoryManager: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onBackup: () => void;
  onResetDictionary: () => void;
  onBuild: () => void;
  onOpenBuildFolder: () => void;
};

export default function AppToolbar({
  searchFilters,
  partsOfSpeech,
  categories,
  saveState,
  wordCount,
  isDirty,
  statusMessage,
  onSearchFiltersChange,
  onCreateWord,
  onOpenPartOfSpeechManager,
  onOpenCategoryManager,
  onExportJson,
  onImportJson,
  onBackup,
  onResetDictionary,
  onBuild,
  onOpenBuildFolder,
}: AppToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-main">
        <input
          className="search-input"
          placeholder="検索"
          value={searchFilters.query}
          onChange={(event) =>
            onSearchFiltersChange((current) => ({
              ...current,
              query: event.target.value,
            }))
          }
        />
        <select
          value={searchFilters.partOfSpeechId}
          onChange={(event) =>
            onSearchFiltersChange((current) => ({
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
            onSearchFiltersChange((current) => ({
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
        <button type="button" onClick={onCreateWord}>
          単語追加
        </button>
        <button type="button" onClick={onOpenPartOfSpeechManager}>
          品詞管理
        </button>
        <button type="button" onClick={onOpenCategoryManager}>
          カテゴリ管理
        </button>
        <button type="button" onClick={onExportJson}>
          JSONエクスポート
        </button>
        <button type="button" onClick={onImportJson}>
          JSONインポート
        </button>
        <button type="button" onClick={onBackup}>
          バックアップ作成
        </button>
        <button className="danger-button" type="button" onClick={onResetDictionary}>
          データ初期化
        </button>
        <button type="button" onClick={onBuild}>
          Build TXT
        </button>
        <button className="secondary-button" type="button" onClick={onOpenBuildFolder}>
          Buildを開く
        </button>
      </div>

      <div className="toolbar-status">
        <span className={`status-badge status-${saveState}`}>{statusLabel(saveState)}</span>
        <span className="word-count">単語数: {wordCount}</span>
        {isDirty ? <span className="dirty-badge">未保存の変更あり</span> : null}
        {statusMessage ? <span className="status-text">{statusMessage}</span> : null}
      </div>
    </header>
  );
}
