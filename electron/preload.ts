import { contextBridge, ipcRenderer } from 'electron';
import type { PackageManagerName } from '../shared/developer-tools-types';
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
  listPortUsages: (ports?: number[]) => ipcRenderer.invoke(IPC_CHANNELS.listPortUsages, ports),
  killPortProcess: (pid: number) => ipcRenderer.invoke(IPC_CHANNELS.killPortProcess, pid),
});
