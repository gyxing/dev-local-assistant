import type { DisplayInfo } from './display-types';

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
export type DesktopNotesAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/** 便利贴窗口在屏幕上的位置和大小，单位为像素。 */
export interface DesktopNotesWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 便利贴窗口内的显示设置。 */
export interface DesktopNoteSettings {
  /** 由主进程单独保存的桌面模式偏好。 */
  desktopMode: boolean;
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
  /** 窗口所在显示器；缺省表示主屏 */
  displayId?: string;
}

/** 本地缓存文件的可见信息。便利贴没有独立缓存目录，这份 JSON 就是缓存。 */
export interface DesktopNotesCacheInfo {
  filePath: string;
  exists: boolean;
  size: number;
  updatedAt?: number;
}

export interface DesktopNotesWindowState {
  state: DesktopNotesState;
  /** 窗口实际应用的模式，置底失败时可能与已保存偏好不同。 */
  desktopModeActive: boolean;
}

export interface DesktopNotesSnapshot extends DesktopNotesWindowState {
  windowOpen: boolean;
  /** 当前生效的窗口位置。未保存过时使用右下角默认值。 */
  windowBounds: DesktopNotesWindowBounds;
  /** 当前窗口所在显示器的工作区，用来把位置说成人话并计算四个角。 */
  workArea: DesktopNotesWorkArea;
  /** 所有显示器，供管理页切换 */
  displays: DisplayInfo[];
  /** 窗口当前所在显示器 id */
  activeDisplayId: string;
  cache: DesktopNotesCacheInfo;
}

/** 工具页提交的便利贴内容变更。主进程先落盘窗口内未保存的编辑，再合并这项变更。 */
export interface DesktopNotesContentUpdate {
  settings?: Partial<Omit<DesktopNoteSettings, 'desktopMode'>>;
  windowBounds?: DesktopNotesWindowBounds;
  /** 切换显示器；主进程会把窗口移到该屏右下角 */
  displayId?: string;
  note?: Pick<DesktopNote, 'id' | 'text' | 'pinned'>;
  deleteNoteId?: string;
}
