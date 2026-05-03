import { appDataDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, exists, mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { BUILD_DIRECTORY_NAME } from "../constants";
import {
  buildAllWordsIndex,
  buildCategoriesFile,
  buildCategoryIndex,
  buildMetadata,
  buildPartOfSpeechFile,
  buildReadme,
} from "./build-formatters";
import { buildPartFiles } from "./build-part-files";
import { getDictionarySnapshot } from "./repository";
import { buildDirectoryRelativePath } from "./utils";

export async function buildTextBundle(): Promise<{ relativePath: string; absolutePath: string }> {
  const snapshot = await getDictionarySnapshot();
  const partFiles = buildPartFiles(snapshot);
  const appDataPath = await appDataDir();
  const absoluteBuildPath = await join(appDataPath, BUILD_DIRECTORY_NAME);

  if (await exists(BUILD_DIRECTORY_NAME, { baseDir: BaseDirectory.AppData })) {
    await remove(BUILD_DIRECTORY_NAME, { baseDir: BaseDirectory.AppData, recursive: true });
  }

  await mkdir(buildDirectoryRelativePath("parts-of-speech"), {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  });

  await writeTextFile(buildDirectoryRelativePath("README.txt"), buildReadme(partFiles), {
    baseDir: BaseDirectory.AppData,
  });
  await writeTextFile(buildDirectoryRelativePath("metadata.txt"), buildMetadata(snapshot), {
    baseDir: BaseDirectory.AppData,
  });
  await writeTextFile(buildDirectoryRelativePath("all-words.txt"), buildAllWordsIndex(snapshot), {
    baseDir: BaseDirectory.AppData,
  });
  await writeTextFile(
    buildDirectoryRelativePath("categories.txt"),
    buildCategoriesFile(snapshot.categories),
    { baseDir: BaseDirectory.AppData },
  );
  await writeTextFile(
    buildDirectoryRelativePath("category-index.txt"),
    buildCategoryIndex(snapshot),
    { baseDir: BaseDirectory.AppData },
  );

  for (const part of partFiles) {
    await writeTextFile(part.relativePath, buildPartOfSpeechFile(part), {
      baseDir: BaseDirectory.AppData,
    });
  }

  return {
    relativePath: `${BUILD_DIRECTORY_NAME}/`,
    absolutePath: absoluteBuildPath,
  };
}
