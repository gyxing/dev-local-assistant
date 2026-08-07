import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export interface SizeSummary {
  sizeBytes: number;
  fileCount: number;
}

export async function calculateDirectorySize(rootPath: string): Promise<SizeSummary> {
  let sizeBytes = 0;
  let fileCount = 0;
  const pendingDirs = [rootPath];

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pendingDirs.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = await fs.stat(entryPath);
        sizeBytes += stat.size;
        fileCount += 1;
      } catch {
        // 文件可能在统计过程中被删除，忽略单个文件失败。
      }
    }
  }

  return { sizeBytes, fileCount };
}
