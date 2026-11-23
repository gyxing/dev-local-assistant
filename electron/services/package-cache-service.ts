import { shell } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  PackageCacheCleanResult,
  PackageCacheItem,
  PackageManagerName,
} from '../../shared/developer-tools-types';
import { calculateDirectorySize } from './size-service';

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT_MS = 30_000;

interface PackageManagerDefinition {
  manager: PackageManagerName;
  label: string;
  pathCommand: [string, ...string[]];
  cleanCommand: [string, ...string[]];
}

interface CommandInvocation {
  file: string;
  args: string[];
}

const PACKAGE_MANAGER_DEFINITIONS: PackageManagerDefinition[] = [
  {
    manager: 'npm',
    label: 'npm cache',
    pathCommand: ['npm', 'config', 'get', 'cache'],
    cleanCommand: ['npm', 'cache', 'clean', '--force'],
  },
  {
    manager: 'pnpm',
    label: 'pnpm store',
    pathCommand: ['pnpm', 'store', 'path'],
    cleanCommand: ['pnpm', 'store', 'prune'],
  },
  {
    manager: 'yarn',
    label: 'yarn cache',
    pathCommand: ['yarn', 'cache', 'dir'],
    cleanCommand: ['yarn', 'cache', 'clean'],
  },
];

function createCommandInvocation([commandName, ...args]: [
  string,
  ...string[],
]): CommandInvocation {
  if (process.platform === 'win32') {
    // Windows 的 .cmd 文件不能由 execFile 直接启动，需要通过系统命令解释器执行。
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `${commandName}.cmd`, ...args],
    };
  }

  return { file: commandName, args };
}

function normalizeCommandOutput(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function createUnavailableItem(
  definition: PackageManagerDefinition,
  error: unknown,
): PackageCacheItem {
  return {
    manager: definition.manager,
    label: definition.label,
    exists: false,
    status: 'unavailable',
    errorMessage: error instanceof Error ? error.message : '命令不可用',
  };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class PackageCacheService {
  async scanCaches(): Promise<PackageCacheItem[]> {
    return Promise.all(
      PACKAGE_MANAGER_DEFINITIONS.map((definition) =>
        this.scanCache(definition),
      ),
    );
  }

  async cleanCache(
    manager: PackageManagerName,
  ): Promise<PackageCacheCleanResult> {
    const definition = PACKAGE_MANAGER_DEFINITIONS.find(
      (item) => item.manager === manager,
    );
    if (!definition) {
      return { manager, success: false, message: '不支持的包管理器' };
    }

    try {
      const invocation = createCommandInvocation(definition.cleanCommand);
      const { stdout, stderr } = await execFileAsync(
        invocation.file,
        invocation.args,
        {
          timeout: COMMAND_TIMEOUT_MS,
          windowsHide: true,
        },
      );
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();

      return {
        manager,
        success: true,
        message: `${definition.label} 清理完成`,
        output,
      };
    } catch (error: unknown) {
      return {
        manager,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : `${definition.label} 清理失败`,
      };
    }
  }

  async openCacheDirectory(cachePath: string) {
    const resolvedPath = path.resolve(cachePath);
    return shell.openPath(resolvedPath);
  }

  private async scanCache(
    definition: PackageManagerDefinition,
  ): Promise<PackageCacheItem> {
    try {
      const invocation = createCommandInvocation(definition.pathCommand);
      const { stdout } = await execFileAsync(invocation.file, invocation.args, {
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      });
      const cachePath = normalizeCommandOutput(stdout);

      if (!cachePath) {
        return {
          manager: definition.manager,
          label: definition.label,
          exists: false,
          status: 'failed',
          errorMessage: '未能识别缓存目录',
        };
      }

      const exists = await pathExists(cachePath);
      if (!exists) {
        return {
          manager: definition.manager,
          label: definition.label,
          cachePath,
          exists: false,
          status: 'missing',
        };
      }

      const summary = await calculateDirectorySize(cachePath);
      return {
        manager: definition.manager,
        label: definition.label,
        cachePath,
        exists: true,
        sizeBytes: summary.sizeBytes,
        fileCount: summary.fileCount,
        status: 'ready',
      };
    } catch (error: unknown) {
      return createUnavailableItem(definition, error);
    }
  }
}
