import { app } from 'electron';
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
import type { DesktopNotesCacheInfo, DesktopNotesState } from '../../shared/desktop-notes-types';

const STATE_FILE_NAME = 'desktop-notes.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 清洗本地 JSON，避免损坏数据让便利贴窗口无法打开。 */
export function normalizeDesktopNotesState(value: unknown): DesktopNotesState {
  if (!isRecord(value)) {
    return createDefaultDesktopNotesState();
  }

  const notes = Array.isArray(value.notes) ? value.notes.filter(isDesktopNote) : [];
  const settings = isRecord(value.settings) ? value.settings : {};
  const rawBounds = isRecord(value.windowBounds) ? value.windowBounds : undefined;
  const windowBounds = normalizeDesktopNotesWindowBounds(
    rawBounds
      ? {
          x: typeof rawBounds.x === 'number' ? rawBounds.x : Number.NaN,
          y: typeof rawBounds.y === 'number' ? rawBounds.y : Number.NaN,
          width: typeof rawBounds.width === 'number' ? rawBounds.width : Number.NaN,
          height: typeof rawBounds.height === 'number' ? rawBounds.height : Number.NaN,
        }
      : undefined,
  );

  return {
    schemaVersion: DESKTOP_NOTES_SCHEMA_VERSION,
    notes,
    windowBounds,
    settings: normalizeDesktopNoteSettings({
      ...DEFAULT_DESKTOP_NOTE_SETTINGS,
      maxVisibleNotes: typeof settings.maxVisibleNotes === 'number' ? settings.maxVisibleNotes : undefined,
      maxLinesPerNote: typeof settings.maxLinesPerNote === 'number' ? settings.maxLinesPerNote : undefined,
      showPinnedOnly: settings.showPinnedOnly === true,
      opacity: typeof settings.opacity === 'number' ? settings.opacity : undefined,
      fontSize: typeof settings.fontSize === 'number' ? settings.fontSize : undefined,
    }),
  };
}

export class DesktopNotesService {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, STATE_FILE_NAME);
  }

  /** 便利贴窗口读取状态。没有文件时返回一张默认贴纸。 */
  async loadState(): Promise<DesktopNotesState> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return normalizeDesktopNotesState(JSON.parse(content));
    } catch {
      return createDefaultDesktopNotesState();
    }
  }

  async saveState(state: DesktopNotesState): Promise<DesktopNotesState> {
    const normalizedState = normalizeDesktopNotesState(state);
    if (!normalizedState.windowBounds) {
      const previousBounds = await this.readStoredBounds();
      if (previousBounds) {
        normalizedState.windowBounds = previousBounds;
      }
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(normalizedState, null, 2), 'utf8');
    return normalizedState;
  }

  /** 贴纸窗口保存时可能还没有窗口尺寸，保留文件里已经管理过的位置。 */
  private async readStoredBounds() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      return normalizeDesktopNotesState(JSON.parse(content)).windowBounds;
    } catch {
      return undefined;
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
  async loadPersistedState(): Promise<DesktopNotesState> {
    const cache = await this.getCacheInfo();
    if (!cache.exists) {
      return createEmptyDesktopNotesState();
    }

    return this.loadState();
  }
}

export function createDesktopNotesService() {
  return new DesktopNotesService(app.getPath('userData'));
}
