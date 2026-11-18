import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_DESKTOP_CALENDAR_SETTINGS,
  normalizeDesktopCalendarSettings,
} from '../../shared/desktop-calendar-state';
import type { DesktopCalendarSettings } from '../../shared/desktop-calendar-types';
import {
  DEFAULT_APP_RUNTIME_PREFERENCES,
  type AppConfig,
  type AppRuntimePreferences,
  type DirectoryHistoryItem,
  type IgnoredProject,
  type ProtectedProject,
} from '../../shared/task-types';

const CONFIG_FILE_NAME = 'config.json';
const MAX_DIRECTORY_HISTORY_COUNT = 20;

function normalizeForCompare(targetPath: string) {
  const normalizedPath = path.resolve(targetPath).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeProtectedProject(project: ProtectedProject): ProtectedProject {
  return {
    id: project.id || randomUUID(),
    name: project.name.trim() || path.basename(project.projectPath),
    projectPath: path.resolve(project.projectPath),
    enabled: project.enabled,
    reason: project.reason?.trim(),
    createdAt: project.createdAt || Date.now(),
  };
}

function sanitizeDirectoryHistoryItem(item: DirectoryHistoryItem): DirectoryHistoryItem {
  const resolvedPath = path.resolve(item.path);

  return {
    id: item.id || randomUUID(),
    name: item.name.trim() || path.basename(resolvedPath),
    path: resolvedPath,
    lastUsedAt: item.lastUsedAt || Date.now(),
    scanCount: item.scanCount || 0,
  };
}

function sanitizeIgnoredProject(project: IgnoredProject): IgnoredProject {
  const resolvedProjectPath = path.resolve(project.projectPath);

  return {
    id: project.id || randomUUID(),
    name: project.name.trim() || path.basename(resolvedProjectPath),
    projectPath: resolvedProjectPath,
    nodeModulesPath: project.nodeModulesPath ? path.resolve(project.nodeModulesPath) : undefined,
    reason: project.reason?.trim(),
    createdAt: project.createdAt || Date.now(),
  };
}

function normalizeRuntime(value: unknown): AppRuntimePreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_APP_RUNTIME_PREFERENCES };
  }

  return {
    launchAtLogin: value.launchAtLogin === true,
    quitWhenMainWindowCloses: value.quitWhenMainWindowCloses === true,
    notesWindowOpen: value.notesWindowOpen === true,
  };
}

function createEmptyConfig(): AppConfig {
  return {
    protectedProjects: [],
    directoryHistory: [],
    ignoredProjects: [],
    runtime: { ...DEFAULT_APP_RUNTIME_PREFERENCES },
    calendar: { ...DEFAULT_DESKTOP_CALENDAR_SETTINGS },
  };
}

function parseConfig(value: unknown): AppConfig {
  if (!isRecord(value)) {
    return createEmptyConfig();
  }

  const protectedProjects = (Array.isArray(value.protectedProjects) ? value.protectedProjects : [])
    .filter((project): project is ProtectedProject => {
      if (!isRecord(project)) {
        return false;
      }

      return (
        typeof project.id === 'string' &&
        typeof project.name === 'string' &&
        typeof project.projectPath === 'string' &&
        typeof project.enabled === 'boolean' &&
        typeof project.createdAt === 'number'
      );
    })
    .map(sanitizeProtectedProject);

  const directoryHistory = (Array.isArray(value.directoryHistory) ? value.directoryHistory : [])
    .filter((item): item is DirectoryHistoryItem => {
      if (!isRecord(item)) {
        return false;
      }

      return (
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.path === 'string' &&
        typeof item.lastUsedAt === 'number' &&
        typeof item.scanCount === 'number'
      );
    })
    .map(sanitizeDirectoryHistoryItem)
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_DIRECTORY_HISTORY_COUNT);

  const ignoredProjects = (Array.isArray(value.ignoredProjects) ? value.ignoredProjects : [])
    .filter((project): project is IgnoredProject => {
      if (!isRecord(project)) {
        return false;
      }

      return (
        typeof project.id === 'string' &&
        typeof project.name === 'string' &&
        typeof project.projectPath === 'string' &&
        typeof project.createdAt === 'number'
      );
    })
    .map(sanitizeIgnoredProject);

  return {
    protectedProjects,
    directoryHistory,
    ignoredProjects,
    runtime: normalizeRuntime(value.runtime),
    calendar: normalizeDesktopCalendarSettings(value.calendar),
  };
}

export class ConfigService {
  private configPath: string;

  constructor(userDataPath: string) {
    this.configPath = path.join(userDataPath, CONFIG_FILE_NAME);
  }

  async getConfig(): Promise<AppConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      return parseConfig(JSON.parse(content));
    } catch {
      return createEmptyConfig();
    }
  }

  async saveProtectedProjects(projects: ProtectedProject[]): Promise<AppConfig> {
    const currentConfig = await this.getConfig();
    const uniqueProjects = new Map<string, ProtectedProject>();

    for (const project of projects) {
      const sanitizedProject = sanitizeProtectedProject(project);
      uniqueProjects.set(normalizeForCompare(sanitizedProject.projectPath), sanitizedProject);
    }

    const config: AppConfig = {
      protectedProjects: Array.from(uniqueProjects.values()),
      directoryHistory: currentConfig.directoryHistory,
      ignoredProjects: currentConfig.ignoredProjects,
      runtime: currentConfig.runtime,
      calendar: currentConfig.calendar,
    };

    return this.writeConfig(config);
  }

  async saveDirectoryHistory(historyItems: DirectoryHistoryItem[]): Promise<AppConfig> {
    const currentConfig = await this.getConfig();
    const uniqueItems = new Map<string, DirectoryHistoryItem>();

    for (const item of historyItems) {
      const sanitizedItem = sanitizeDirectoryHistoryItem(item);
      uniqueItems.set(normalizeForCompare(sanitizedItem.path), sanitizedItem);
    }

    const config: AppConfig = {
      protectedProjects: currentConfig.protectedProjects,
      directoryHistory: Array.from(uniqueItems.values())
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
        .slice(0, MAX_DIRECTORY_HISTORY_COUNT),
      ignoredProjects: currentConfig.ignoredProjects,
      runtime: currentConfig.runtime,
      calendar: currentConfig.calendar,
    };

    return this.writeConfig(config);
  }

  async saveIgnoredProjects(projects: IgnoredProject[]): Promise<AppConfig> {
    const currentConfig = await this.getConfig();
    const uniqueProjects = new Map<string, IgnoredProject>();

    for (const project of projects) {
      const sanitizedProject = sanitizeIgnoredProject(project);
      uniqueProjects.set(normalizeForCompare(sanitizedProject.projectPath), sanitizedProject);
    }

    const config: AppConfig = {
      protectedProjects: currentConfig.protectedProjects,
      directoryHistory: currentConfig.directoryHistory,
      ignoredProjects: Array.from(uniqueProjects.values()),
      runtime: currentConfig.runtime,
      calendar: currentConfig.calendar,
    };

    return this.writeConfig(config);
  }

  /** 读取最新运行设置再合并字段，避免便签窗口与系统设置互相覆盖。 */
  async saveRuntime(runtime: Partial<AppRuntimePreferences>): Promise<AppConfig> {
    const currentConfig = await this.getConfig();
    return this.writeConfig({
      ...currentConfig,
      runtime: normalizeRuntime({ ...currentConfig.runtime, ...runtime }),
    });
  }

  async saveCalendarSettings(settings: DesktopCalendarSettings): Promise<AppConfig> {
    const currentConfig = await this.getConfig();
    return this.writeConfig({
      ...currentConfig,
      calendar: normalizeDesktopCalendarSettings(settings),
    });
  }

  private async writeConfig(config: AppConfig): Promise<AppConfig> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    const tempPath = `${this.configPath}.${randomUUID()}.tmp`;
    try {
      // 同目录替换，写入失败时保留原配置文件。
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf8', flag: 'wx' });
      await fs.rename(tempPath, this.configPath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw error;
    }
    return config;
  }

  getActiveProjects(config: AppConfig) {
    return config.protectedProjects.filter((project) => project.enabled);
  }

  getIgnoredProjects(config: AppConfig) {
    return config.ignoredProjects;
  }

  isPathProtected(targetPath: string, projects: ProtectedProject[]) {
    const normalizedTargetPath = normalizeForCompare(targetPath);

    return projects.some((project) => {
      const normalizedProjectPath = normalizeForCompare(project.projectPath);
      return (
        normalizedTargetPath === normalizedProjectPath ||
        normalizedTargetPath.startsWith(`${normalizedProjectPath}${path.sep}`)
      );
    });
  }

  isPathIgnored(targetPath: string, projects: IgnoredProject[]) {
    const normalizedTargetPath = normalizeForCompare(targetPath);

    return projects.some((project) => {
      const normalizedProjectPath = normalizeForCompare(project.projectPath);
      const normalizedNodeModulesPath = project.nodeModulesPath
        ? normalizeForCompare(project.nodeModulesPath)
        : undefined;

      return (
        normalizedTargetPath === normalizedProjectPath ||
        normalizedTargetPath.startsWith(`${normalizedProjectPath}${path.sep}`) ||
        normalizedTargetPath === normalizedNodeModulesPath
      );
    });
  }
}
