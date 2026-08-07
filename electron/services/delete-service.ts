import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';
import type {
  DeleteFailureDetail,
  DeleteMode,
  DeleteTask,
  DeleteTaskProgress,
  DeleteTaskStatus,
  NodeModulesItem,
} from '../../shared/task-types';

type DeleteItemHandler = (event: {
  itemId: string;
  status: NodeModulesItem['status'];
  errorMessage?: string;
  failureDetail?: DeleteFailureDetail;
}) => void;

type DeleteStatusHandler = (
  taskId: string,
  status: DeleteTaskStatus,
  currentItemId: string | undefined,
  progress: DeleteTaskProgress,
) => void;

interface DeleteRuntimeTask extends DeleteTask {
  pauseRequested: boolean;
}

interface DeleteError extends Error {
  code?: string;
  syscall?: string;
  path?: string;
}

export class DeleteService {
  private tasks = new Map<string, DeleteRuntimeTask>();

  start(items: NodeModulesItem[], mode: DeleteMode, onItem: DeleteItemHandler, onStatus: DeleteStatusHandler) {
    const taskId = randomUUID();
    const task: DeleteRuntimeTask = {
      id: taskId,
      mode,
      status: 'deleting',
      completedItemIds: [],
      pendingItemIds: items.map((item) => item.id),
      failedItemIds: [],
      pauseRequested: false,
    };

    this.tasks.set(taskId, task);
    onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
    void this.run(taskId, items, onItem, onStatus);
    return taskId;
  }

  pause(taskId: string, onStatus: DeleteStatusHandler) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.pauseRequested = true;
    task.status = 'delete-pausing';
    onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
  }

  resume(
    taskId: string,
    availableItems: NodeModulesItem[],
    onItem: DeleteItemHandler,
    onStatus: DeleteStatusHandler,
  ) {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'deleting') {
      return;
    }

    task.pauseRequested = false;
    task.status = 'deleting';
    const pendingItems = availableItems.filter((item) => task.pendingItemIds.includes(item.id));
    onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
    void this.run(taskId, pendingItems, onItem, onStatus);
  }

  finish(taskId: string, onItem: DeleteItemHandler, onStatus: DeleteStatusHandler) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = 'finished';
    task.pauseRequested = true;

    for (const itemId of task.pendingItemIds) {
      onItem({ itemId, status: 'delete-canceled' });
    }

    onStatus(taskId, 'finished', task.currentItemId, this.createProgress(task));
  }

  private async run(
    taskId: string,
    items: NodeModulesItem[],
    onItem: DeleteItemHandler,
    onStatus: DeleteStatusHandler,
  ) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    for (const item of items) {
      if (task.pauseRequested || task.status === 'finished') {
        task.status = task.status === 'finished' ? 'finished' : 'delete-paused';
        onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
        return;
      }

      task.currentItemId = item.id;
      onStatus(taskId, 'deleting', item.id, this.createProgress(task));
      onItem({ itemId: item.id, status: 'deleting' });

      const resolvedPath = path.resolve(item.nodeModulesPath);
      const existsBeforeDelete = await this.pathExists(resolvedPath);

      try {
        if (task.mode === 'trash') {
          await shell.trashItem(resolvedPath);
        } else {
          await fs.rm(resolvedPath, { recursive: true, force: true });
        }

        task.completedItemIds.push(item.id);
        task.pendingItemIds = task.pendingItemIds.filter((itemId) => itemId !== item.id);
        onItem({ itemId: item.id, status: 'deleted' });
        onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
      } catch (error) {
        const failureDetail = await this.createFailureDetail(task.mode, item, resolvedPath, existsBeforeDelete, error);

        task.failedItemIds.push(item.id);
        task.pendingItemIds = task.pendingItemIds.filter((itemId) => itemId !== item.id);
        onItem({
          itemId: item.id,
          status: 'delete-failed',
          errorMessage: failureDetail.errorMessage,
          failureDetail,
        });
        onStatus(taskId, task.status, task.currentItemId, this.createProgress(task));
      }
    }

    task.status = 'completed';
    task.currentItemId = undefined;
    onStatus(taskId, 'completed', undefined, this.createProgress(task));
  }

  private createProgress(task: DeleteRuntimeTask): DeleteTaskProgress {
    return {
      totalCount: task.completedItemIds.length + task.failedItemIds.length + task.pendingItemIds.length,
      completedCount: task.completedItemIds.length,
      failedCount: task.failedItemIds.length,
      pendingCount: task.pendingItemIds.length,
      currentItemId: task.currentItemId,
    };
  }

  private async createFailureDetail(
    mode: DeleteMode,
    item: NodeModulesItem,
    resolvedPath: string,
    existsBeforeDelete: boolean | undefined,
    error: unknown,
  ): Promise<DeleteFailureDetail> {
    const normalizedError = this.normalizeError(error);
    const existsAfterFailure = await this.pathExists(resolvedPath);
    const canAccessAfterFailure = existsAfterFailure ? await this.canAccessPath(resolvedPath) : false;

    return {
      mode,
      nodeModulesPath: item.nodeModulesPath,
      resolvedPath,
      errorName: normalizedError.name,
      errorCode: normalizedError.code,
      errorSyscall: normalizedError.syscall,
      errorPath: normalizedError.path,
      errorMessage: normalizedError.message,
      existsBeforeDelete,
      existsAfterFailure,
      canAccessAfterFailure,
      diagnosticMessage: this.createDiagnosticMessage(mode, normalizedError, existsAfterFailure, canAccessAfterFailure),
      suggestion: this.createSuggestion(mode, normalizedError, existsAfterFailure, canAccessAfterFailure),
    };
  }

  private normalizeError(error: unknown): DeleteError {
    if (error instanceof Error) {
      return error as DeleteError;
    }

    return new Error('删除失败');
  }

  private async pathExists(targetPath: string): Promise<boolean | undefined> {
    try {
      await fs.stat(targetPath);
      return true;
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      return normalizedError.code === 'ENOENT' ? false : undefined;
    }
  }

  private async canAccessPath(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private createDiagnosticMessage(
    mode: DeleteMode,
    error: DeleteError,
    existsAfterFailure: boolean | undefined,
    canAccessAfterFailure: boolean,
  ) {
    if (existsAfterFailure === false) {
      return '目录已经不存在，可能是在删除过程中被其他程序移走或删除了。';
    }

    if (error.code === 'EPERM' || error.code === 'EACCES') {
      return '系统拒绝删除该目录，通常是权限不足、文件只读或目录内文件正在被占用。';
    }

    if (error.code === 'EBUSY') {
      return '目录内有文件正在被其他程序占用，Windows 暂时无法删除。';
    }

    if (error.code === 'ENOTEMPTY') {
      return '目录仍包含未能删除的文件，常见于并发写入、权限不足或目录内有链接。';
    }

    if (mode === 'trash' && error.message === 'Failed to perform delete operation') {
      return '系统回收站拒绝了该目录，常见原因是文件被占用、权限不足、磁盘不支持回收站或路径异常。';
    }

    if (!canAccessAfterFailure) {
      return '删除失败后仍无法访问该目录，可能是权限不足或文件被占用。';
    }

    return '底层删除接口返回了失败，但没有提供更具体的系统错误码。';
  }

  private createSuggestion(
    mode: DeleteMode,
    error: DeleteError,
    existsAfterFailure: boolean | undefined,
    canAccessAfterFailure: boolean,
  ) {
    if (existsAfterFailure === false) {
      return '重新扫描当前目录即可刷新列表。';
    }

    if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EBUSY' || !canAccessAfterFailure) {
      return '关闭正在使用该项目的终端、编辑器和 dev server 后重试；必要时以管理员身份运行应用。';
    }

    if (mode === 'trash') {
      return '可以先关闭占用进程后重试移入回收站；确认不需要恢复时，可改用永久删除。';
    }

    return '建议重新扫描后重试；如果仍失败，请检查目录权限、路径长度和磁盘状态。';
  }
}
