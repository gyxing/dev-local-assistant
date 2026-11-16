import type { AppRuntimePreferences } from './task-types';

/** 单张桌面贴纸。坐标相对于便利贴窗口左上角。 */
export interface DesktopNote {
  id: string;
  text: string;
  x: number;
  y: number;
  zIndex: number;
  pinned: boolean;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** 主屏幕可用区域，不含任务栏。 */
export interface DesktopNotesWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 便利贴窗口相对屏幕的停靠位置。 */
export type DesktopNotesAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

/** 便利贴窗口在屏幕上的位置和大小，单位为像素。 */
export interface DesktopNotesWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 便利贴窗口内的显示设置。 */
export interface DesktopNoteSettings {
  maxVisibleNotes: number;
  maxLinesPerNote: number;
  showPinnedOnly: boolean;
  opacity: number;
  fontSize: number;
}

/** 写入 desktop-notes.json 的完整状态。 */
export interface DesktopNotesState {
  schemaVersion: number;
  notes: DesktopNote[];
  settings: DesktopNoteSettings;
  windowBounds?: DesktopNotesWindowBounds;
}

/** 本地缓存文件的可见信息。便利贴没有独立缓存目录，这份 JSON 就是缓存。 */
export interface DesktopNotesCacheInfo {
  filePath: string;
  exists: boolean;
  size: number;
  updatedAt?: number;
}

export interface DesktopNotesSnapshot {
  windowOpen: boolean;
  state: DesktopNotesState;
  /** 当前生效的窗口位置。未保存过时使用右下角默认值。 */
  windowBounds: DesktopNotesWindowBounds;
  /** 当前主屏幕工作区，用来把位置说成人话并计算四个角。 */
  workArea: DesktopNotesWorkArea;
  cache: DesktopNotesCacheInfo;
  runtime: AppRuntimePreferences;
  packaged: boolean;
}

/** 工具页提交的便利贴内容变更。主进程先落盘窗口内未保存的编辑，再合并这项变更。 */
export interface DesktopNotesContentUpdate {
  settings?: Partial<DesktopNoteSettings>;
  windowBounds?: DesktopNotesWindowBounds;
  note?: Pick<DesktopNote, 'id' | 'text' | 'pinned'>;
  deleteNoteId?: string;
}

/** 工具页可以修改的运行开关。便利贴窗口开关由打开和关闭操作维护。 */
export interface DesktopNotesRuntimeUpdate {
  launchAtLogin?: boolean;
  quitWhenMainWindowCloses?: boolean;
}
