import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NodeModulesItem, ScanTaskStatus } from '../../shared/task-types';

type ScanItemHandler = (item: NodeModulesItem) => void;
type ScanStatusHandler = (
  taskId: string,
  status: ScanTaskStatus,
  message?: string,
) => void;
type PathSkipReason = 'protected' | 'ignored';
type PathSkipChecker = (targetPath: string) => PathSkipReason | undefined;

interface ScanTask {
  id: string;
  rootPath: string;
  pendingDirs: string[];
  paused: boolean;
  running: boolean;
  seenNodeModules: Set<string>;
  skippedProtectedCount: number;
  skippedIgnoredCount: number;
}

export class ScanService {
  private tasks = new Map<string, ScanTask>();

  start(
    rootPath: string,
    onItemFound: ScanItemHandler,
    onStatus: ScanStatusHandler,
    getPathSkipReason: PathSkipChecker = () => undefined,
  ) {
    const task: ScanTask = {
      id: randomUUID(),
      rootPath,
      pendingDirs: [rootPath],
      paused: false,
      running: false,
      seenNodeModules: new Set(),
      skippedProtectedCount: 0,
      skippedIgnoredCount: 0,
    };

    this.tasks.set(task.id, task);
    void this.run(task.id, onItemFound, onStatus, getPathSkipReason);
    return task.id;
  }

  pause(taskId: string, onStatus: ScanStatusHandler) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.paused = true;
    onStatus(taskId, 'scan-paused', '扫描已暂停，结果可能不完整');
  }

  resume(
    taskId: string,
    onItemFound: ScanItemHandler,
    onStatus: ScanStatusHandler,
    getPathSkipReason: PathSkipChecker = () => undefined,
  ) {
    const task = this.tasks.get(taskId);
    if (!task || task.running) {
      return;
    }

    task.paused = false;
    void this.run(taskId, onItemFound, onStatus, getPathSkipReason);
  }

  restart(
    taskId: string,
    onItemFound: ScanItemHandler,
    onStatus: ScanStatusHandler,
    getPathSkipReason: PathSkipChecker = () => undefined,
  ) {
    const previousTask = this.tasks.get(taskId);
    if (!previousTask) {
      return undefined;
    }

    this.tasks.delete(taskId);
    return this.start(
      previousTask.rootPath,
      onItemFound,
      onStatus,
      getPathSkipReason,
    );
  }

  private async run(
    taskId: string,
    onItemFound: ScanItemHandler,
    onStatus: ScanStatusHandler,
    getPathSkipReason: PathSkipChecker,
  ) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.running = true;
    onStatus(taskId, 'scanning');

    while (task.pendingDirs.length > 0 && !task.paused) {
      const currentDir = task.pendingDirs.shift();
      if (!currentDir) {
        continue;
      }

      await this.scanDirectory(
        task,
        currentDir,
        onItemFound,
        getPathSkipReason,
      );
    }

    task.running = false;

    if (task.paused) {
      onStatus(
        taskId,
        'scan-paused',
        this.createStatusMessage(task, '扫描已暂停，结果可能不完整'),
      );
      return;
    }

    onStatus(taskId, 'completed', this.createStatusMessage(task));
  }

  private async scanDirectory(
    task: ScanTask,
    currentDir: string,
    onItemFound: ScanItemHandler,
    getPathSkipReason: PathSkipChecker,
  ) {
    const skipReason = getPathSkipReason(currentDir);
    if (skipReason === 'protected') {
      task.skippedProtectedCount += 1;
      return;
    }

    if (skipReason === 'ignored') {
      task.skippedIgnoredCount += 1;
      return;
    }

    let entries: Dirent[];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasPackageJson = entries.some(
      (entry) => entry.isFile() && entry.name === 'package.json',
    );
    const nodeModulesEntry = entries.find(
      (entry) => entry.isDirectory() && entry.name === 'node_modules',
    );

    if (nodeModulesEntry) {
      const nodeModulesPath = path.join(currentDir, 'node_modules');

      if (!task.seenNodeModules.has(nodeModulesPath)) {
        task.seenNodeModules.add(nodeModulesPath);
        onItemFound(
          this.createItem(currentDir, nodeModulesPath, hasPackageJson),
        );
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules') {
        continue;
      }

      task.pendingDirs.push(path.join(currentDir, entry.name));
    }
  }

  private createItem(
    projectPath: string,
    nodeModulesPath: string,
    hasPackageJson: boolean,
  ): NodeModulesItem {
    return {
      id: randomUUID(),
      projectName: hasPackageJson ? path.basename(projectPath) : '未识别项目',
      projectPath,
      nodeModulesPath,
      source: hasPackageJson ? 'package-json' : 'orphan-node-modules',
      status: 'found',
      riskLevel: hasPackageJson ? 'normal' : 'attention',
    };
  }

  private createStatusMessage(task: ScanTask, prefix?: string) {
    const skippedMessage =
      task.skippedProtectedCount > 0
        ? `已跳过 ${task.skippedProtectedCount} 个保护项目`
        : undefined;
    const ignoredMessage =
      task.skippedIgnoredCount > 0
        ? `已忽略 ${task.skippedIgnoredCount} 个项目`
        : undefined;

    return (
      [prefix, skippedMessage, ignoredMessage].filter(Boolean).join('，') ||
      undefined
    );
  }
}
