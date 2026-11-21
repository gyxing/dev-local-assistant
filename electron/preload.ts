import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettingsUpdate } from '../shared/app-settings-types';
import type {
  DesktopNotesContentUpdate,
  DesktopNotesSnapshot,
  DesktopNotesState,
  DesktopNotesWindowState,
} from '../shared/desktop-notes-types';
import type { CalendarTimeInfo, DesktopCalendarSettings, DesktopCalendarSnapshot } from '../shared/desktop-calendar-types';
import type { PackageManagerName, PortUsageQuery } from '../shared/developer-tools-types';
import type { HostsSaveRequest } from '../shared/network-tools-types';
import type {
  DeleteMode,
  DirectoryHistoryItem,
  IgnoredProject,
  ProtectedProject,
  TaskEvent,
} from '../shared/task-types';
import { IPC_CHANNELS } from './ipc/channels';

contextBridge.exposeInMainWorld('clearNodeModules', {
  selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.selectDirectory),
  startScan: (rootPath: string) => ipcRenderer.invoke(IPC_CHANNELS.startScan, rootPath),
  pauseScan: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.pauseScan, taskId),
  resumeScan: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.resumeScan, taskId),
  restartScan: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.restartScan, taskId),
  startDelete: (itemIds: string[], mode: DeleteMode) =>
    ipcRenderer.invoke(IPC_CHANNELS.startDelete, itemIds, mode),
  pauseDelete: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.pauseDelete, taskId),
  resumeDelete: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.resumeDelete, taskId),
  finishDelete: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.finishDelete, taskId),
  getAppConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getAppConfig),
  saveProtectedProjects: (projects: ProtectedProject[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProtectedProjects, projects),
  saveDirectoryHistory: (historyItems: DirectoryHistoryItem[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveDirectoryHistory, historyItems),
  saveIgnoredProjects: (projects: IgnoredProject[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveIgnoredProjects, projects),
  onTaskEvent: (handler: (event: TaskEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: TaskEvent) => handler(event);
    ipcRenderer.on(IPC_CHANNELS.taskEvent, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.taskEvent, listener);
  },
});

contextBridge.exposeInMainWorld('developerAssistant', {
  scanPackageCaches: () => ipcRenderer.invoke(IPC_CHANNELS.scanPackageCaches),
  cleanPackageCache: (manager: PackageManagerName) =>
    ipcRenderer.invoke(IPC_CHANNELS.cleanPackageCache, manager),
  openPackageCacheDirectory: (cachePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPackageCacheDirectory, cachePath),
  listPortUsages: (query: PortUsageQuery) => ipcRenderer.invoke(IPC_CHANNELS.listPortUsages, query),
  killPortProcess: (pid: number) => ipcRenderer.invoke(IPC_CHANNELS.killPortProcess, pid),
  getHostsDocument: () => ipcRenderer.invoke(IPC_CHANNELS.getHostsDocument),
  saveHosts: (request: HostsSaveRequest) => ipcRenderer.invoke(IPC_CHANNELS.saveHosts, request),
  listHostsBackups: () => ipcRenderer.invoke(IPC_CHANNELS.listHostsBackups),
  restoreHostsBackup: (backupId: string, sourceHash: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreHostsBackup, backupId, sourceHash),
  flushDns: () => ipcRenderer.invoke(IPC_CHANNELS.flushDns),
});

contextBridge.exposeInMainWorld('appSettings', {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.appSettingsGetSnapshot),
  save: (patch: AppSettingsUpdate) => ipcRenderer.invoke(IPC_CHANNELS.appSettingsSave, patch),
});

if (process.platform === 'win32') {
  contextBridge.exposeInMainWorld('mainWindowMenu', {
    getGroups: () => ipcRenderer.invoke(IPC_CHANNELS.mainWindowMenu),
    runCommand: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.mainWindowMenuCommand, id),
  });
  contextBridge.exposeInMainWorld('mainWindowAbout', {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.mainWindowAboutVersion),
    openProjectHome: () => ipcRenderer.invoke(IPC_CHANNELS.mainWindowOpenProjectHome),
  });
}

contextBridge.exposeInMainWorld('desktopNotes', {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesGetSnapshot),
  openWindow: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesOpenWindow),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesCloseWindow),
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesRefresh),
  loadState: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesLoadState),
  setDesktopMode: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesSetDesktopMode, enabled),
  saveState: (state: DesktopNotesState) => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesSaveState, state),
  updateContent: (update: DesktopNotesContentUpdate) =>
    ipcRenderer.invoke(IPC_CHANNELS.desktopNotesUpdateContent, update),
  highlightBounds: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesHighlightBounds),
  onBoundsHighlight: (handler: (durationMs: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, durationMs: number) => handler(durationMs);
    ipcRenderer.on(IPC_CHANNELS.desktopNotesBoundsHighlight, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopNotesBoundsHighlight, listener);
  },
  takeBoundsHighlight: () => ipcRenderer.invoke(IPC_CHANNELS.desktopNotesTakeBoundsHighlight),
  onSnapshot: (handler: (snapshot: DesktopNotesSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DesktopNotesSnapshot) => handler(snapshot);
    ipcRenderer.on(IPC_CHANNELS.desktopNotesSnapshot, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopNotesSnapshot, listener);
  },
  onApplyState: (handler: (state: DesktopNotesWindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopNotesWindowState) => handler(state);
    ipcRenderer.on(IPC_CHANNELS.desktopNotesApplyState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopNotesApplyState, listener);
  },
  onFlushRequest: (handler: () => DesktopNotesState | undefined) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: string) => {
      ipcRenderer.send(IPC_CHANNELS.desktopNotesFlushResult, { requestId, state: handler() });
    };
    ipcRenderer.on(IPC_CHANNELS.desktopNotesFlush, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopNotesFlush, listener);
  },
  onResumeEdits: (handler: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.desktopNotesResumeEdits, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopNotesResumeEdits, handler);
  },
});

contextBridge.exposeInMainWorld('desktopCalendar', {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarGetSnapshot),
  openWindow: () => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarOpenWindow),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarCloseWindow),
  saveSettings: (settings: Partial<DesktopCalendarSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarSaveSettings, settings),
  getHolidays: (year: number) => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarGetHolidays, year),
  getTime: () => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarGetTime),
  syncTime: () => ipcRenderer.invoke(IPC_CHANNELS.desktopCalendarSyncTime),
  onSnapshot: (handler: (snapshot: DesktopCalendarSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DesktopCalendarSnapshot) => handler(snapshot);
    ipcRenderer.on(IPC_CHANNELS.desktopCalendarSnapshot, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopCalendarSnapshot, listener);
  },
  onTimeChanged: (handler: (info: CalendarTimeInfo) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: CalendarTimeInfo) => handler(info);
    ipcRenderer.on(IPC_CHANNELS.desktopCalendarTimeChanged, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopCalendarTimeChanged, listener);
  },
  onSettingsChanged: (handler: (settings: DesktopCalendarSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: DesktopCalendarSettings) => handler(settings);
    ipcRenderer.on(IPC_CHANNELS.desktopCalendarSettingsChanged, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopCalendarSettingsChanged, listener);
  },
});
