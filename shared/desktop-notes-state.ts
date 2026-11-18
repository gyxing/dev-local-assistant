import type {
  DesktopNote,
  DesktopNoteSettings,
  DesktopNotesState,
  DesktopNotesWindowBounds,
} from './desktop-notes-types';

export const DESKTOP_NOTES_SCHEMA_VERSION = 2;

export const DEFAULT_NOTES_WINDOW_WIDTH = 560;
export const DEFAULT_NOTES_WINDOW_HEIGHT = 420;
/** 检测范围时便利贴窗口高亮的持续时间 */
export const DESKTOP_NOTES_HIGHLIGHT_DURATION_MS = 3000;
/** 没有贴纸时窗口收缩到的边长，刚好包住右下角的新建按钮 */
export const DESKTOP_NOTES_COMPACT_SIZE = 80;

export const DEFAULT_DESKTOP_NOTE_SETTINGS: DesktopNoteSettings = {
  desktopMode: false,
  maxVisibleNotes: 12,
  maxLinesPerNote: 3,
  showPinnedOnly: false,
  opacity: 0.92,
  fontSize: 15,
};

const NOTE_COLORS = ['#fff7d6', '#f6f1e7', '#eef3ee', '#f3f0fb', '#f2f4f7'];

export function createEmptyDesktopNotesState(): DesktopNotesState {
  return {
    schemaVersion: DESKTOP_NOTES_SCHEMA_VERSION,
    notes: [],
    settings: { ...DEFAULT_DESKTOP_NOTE_SETTINGS },
  };
}

/** 首次打开便利贴时给一张可编辑的默认贴纸，避免空白窗口。 */
export function createDefaultDesktopNotesState(): DesktopNotesState {
  const now = Date.now();

  return {
    schemaVersion: DESKTOP_NOTES_SCHEMA_VERSION,
    notes: [
      {
        id: 'welcome',
        text: '双击编辑这张贴纸',
        x: 24,
        y: 24,
        zIndex: 1,
        pinned: true,
        color: NOTE_COLORS[0],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: { ...DEFAULT_DESKTOP_NOTE_SETTINGS },
  };
}

export function getNextNoteColor(index: number) {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

export function clampDesktopNoteNumber(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export function normalizeDesktopNoteSettings(settings: Partial<DesktopNoteSettings>): DesktopNoteSettings {
  return {
    desktopMode: settings.desktopMode === true,
    maxVisibleNotes: clampDesktopNoteNumber(
      settings.maxVisibleNotes ?? DEFAULT_DESKTOP_NOTE_SETTINGS.maxVisibleNotes,
      1,
      20,
    ),
    maxLinesPerNote: clampDesktopNoteNumber(
      settings.maxLinesPerNote ?? DEFAULT_DESKTOP_NOTE_SETTINGS.maxLinesPerNote,
      1,
      20,
    ),
    showPinnedOnly: Boolean(settings.showPinnedOnly),
    opacity: clampDesktopNoteNumber(settings.opacity ?? DEFAULT_DESKTOP_NOTE_SETTINGS.opacity, 0.35, 1),
    fontSize: clampDesktopNoteNumber(settings.fontSize ?? DEFAULT_DESKTOP_NOTE_SETTINGS.fontSize, 12, 28),
  };
}

export function normalizeDesktopNotesWindowBounds(
  value: Partial<DesktopNotesWindowBounds> | undefined,
): DesktopNotesWindowBounds | undefined {
  if (!value) {
    return undefined;
  }

  const width = clampDesktopNoteNumber(value.width ?? Number.NaN, 320, 2400);
  const height = clampDesktopNoteNumber(value.height ?? Number.NaN, 240, 1600);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.width) || !Number.isFinite(value.height)) {
    return undefined;
  }

  return {
    x: Math.round(value.x as number),
    y: Math.round(value.y as number),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function isDesktopNote(value: unknown): value is DesktopNote {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const note = value as Partial<DesktopNote>;
  return (
    typeof note.id === 'string' &&
    typeof note.text === 'string' &&
    typeof note.x === 'number' &&
    typeof note.y === 'number' &&
    typeof note.zIndex === 'number' &&
    typeof note.pinned === 'boolean' &&
    typeof note.color === 'string' &&
    typeof note.createdAt === 'number' &&
    typeof note.updatedAt === 'number'
  );
}
