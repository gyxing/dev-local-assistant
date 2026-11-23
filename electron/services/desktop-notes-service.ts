import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createDefaultDesktopNotesState,
  createEmptyDesktopNotesState,
  DEFAULT_DESKTOP_NOTE_SETTINGS,
  DESKTOP_NOTES_SCHEMA_VERSION,
  isDesktopNote,
  normalizeDesktopNoteSettings,
  normalizeDesktopNotesWindowBounds,
} from '../../shared/desktop-notes-state';
import type {
  DesktopNotesCacheInfo,
  DesktopNotesState,
} from '../../shared/desktop-notes-types';

const STATE_FILE_NAME = 'desktop-notes.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 清洗本地 JSON，避免损坏数据让便利贴窗口无法打开。 */
export function normalizeDesktopNotesState(value: unknown): DesktopNotesState {
  if (!isRecord(value)) {
    return createDefaultDesktopNotesState();
  }

  const notes = Array.isArray(value.notes)
    ? value.notes.filter(isDesktopNote)
    : [];
  const settings = isRecord(value.settings) ? value.settings : {};
  const rawBounds = isRecord(value.windowBounds)
    ? value.windowBounds
    : undefined;
  const windowBounds = normalizeDesktopNotesWindowBounds(
    rawBounds
      ? {
          x: typeof rawBounds.x === 'number' ? rawBounds.x : Number.NaN,
          y: typeof rawBounds.y === 'number' ? rawBounds.y : Number.NaN,
          width:
            typeof rawBounds.width === 'number' ? rawBounds.width : Number.NaN,
          height:
            typeof rawBounds.height === 'number'
              ? rawBounds.height
              : Number.NaN,
        }
      : undefined,
  );

  return {
    schemaVersion: DESKTOP_NOTES_SCHEMA_VERSION,
    notes,
    windowBounds,
    displayId:
      typeof value.displayId === 'string' ? value.displayId : undefined,
    settings: normalizeDesktopNoteSettings({
      ...DEFAULT_DESKTOP_NOTE_SETTINGS,
      desktopMode: settings.desktopMode === true,
      maxVisibleNotes:
        typeof settings.maxVisibleNotes === 'number'
          ? settings.maxVisibleNotes
          : undefined,
      maxLinesPerNote:
        typeof settings.maxLinesPerNote === 'number'
          ? settings.maxLinesPerNote
          : undefined,
      showPinnedOnly: settings.showPinnedOnly === true,
      opacity:
        typeof settings.opacity === 'number' ? settings.opacity : undefined,
      fontSize:
        typeof settings.fontSize === 'number' ? settings.fontSize : undefined,
    }),
  };
}

export class DesktopNotesService {
  private readonly filePath: string;
  private pendingWrite: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, STATE_FILE_NAME);
  }

  /** 便利贴窗口读取状态。没有文件时返回一张默认贴纸。 */
  async loadState(): Promise<DesktopNotesState> {
    return this.readState(createDefaultDesktopNotesState);
  }

  private async readState(
    onMissing: () => DesktopNotesState,
  ): Promise<DesktopNotesState> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return normalizeDesktopNotesState(JSON.parse(content));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return onMissing();
      if (error instanceof SyntaxError) return createDefaultDesktopNotesState();
      throw error;
    }
  }

  /** 按顺序读取最新文件并合并，返回已保存的状态。 */
  updateState(
    update: (current: DesktopNotesState) => DesktopNotesState,
    onMissing = createDefaultDesktopNotesState,
  ): Promise<DesktopNotesState> {
    const task = this.pendingWrite.then(async () => {
      const state = normalizeDesktopNotesState(
        update(await this.readState(onMissing)),
      );
      await this.writeState(state);
      return state;
    });
    this.pendingWrite = task.catch(() => undefined);
    return task;
  }

  private async writeState(state: DesktopNotesState) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      // 同目录替换保证读者只会看到完整的 JSON。
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      });
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  async getCacheInfo(): Promise<DesktopNotesCacheInfo> {
    try {
      const stat = await fs.stat(this.filePath);
      return {
        filePath: this.filePath,
        exists: true,
        size: stat.size,
        updatedAt: stat.mtimeMs,
      };
    } catch {
      return {
        filePath: this.filePath,
        exists: false,
        size: 0,
      };
    }
  }

  /** 工具页在文件尚未创建时不展示默认贴纸，避免把内存数据当成已保存数据。 */
  loadPersistedState(): Promise<DesktopNotesState> {
    return this.readState(createEmptyDesktopNotesState);
  }
}

export function createDesktopNotesService() {
  return new DesktopNotesService(app.getPath('userData'));
}
