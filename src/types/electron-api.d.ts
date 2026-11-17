import type {
  DesktopNotesContentUpdate,
  DesktopNotesRuntimeUpdate,
  DesktopNotesSnapshot,
  DesktopNotesState,
} from '../../shared/desktop-notes-types';
import type {
  KillProcessResult,
  PackageCacheCleanResult,
  PackageCacheItem,
  PackageManagerName,
  PortUsageItem,
  PortUsageQuery,
} from '../../shared/developer-tools-types';
import type {
  DnsFlushResult,
  HostsBackupItem,
  HostsDocument,
  HostsMutationResult,
  HostsSaveRequest,
} from '../../shared/network-tools-types';
import type {
  AppConfig,
  DeleteMode,
  DirectoryHistoryItem,
  IgnoredProject,
  ProtectedProject,
  TaskEvent,
} from '../../shared/task-types';

export interface ClearNodeModulesApi {
  selectDirectory: () => Promise<string | undefined>;
  startScan: (rootPath: string) => Promise<string>;
  pauseScan: (taskId: string) => Promise<void>;
  resumeScan: (taskId: string) => Promise<void>;
  restartScan: (taskId: string) => Promise<string>;
  startDelete: (itemIds: string[], mode: DeleteMode) => Promise<string>;
  pauseDelete: (taskId: string) => Promise<void>;
  resumeDelete: (taskId: string) => Promise<void>;
  finishDelete: (taskId: string) => Promise<void>;
  getAppConfig: () => Promise<AppConfig>;
  saveProtectedProjects: (projects: ProtectedProject[]) => Promise<AppConfig>;
  saveDirectoryHistory: (historyItems: DirectoryHistoryItem[]) => Promise<AppConfig>;
  saveIgnoredProjects: (projects: IgnoredProject[]) => Promise<AppConfig>;
  onTaskEvent: (handler: (event: TaskEvent) => void) => () => void;
}

export interface DeveloperAssistantApi {
  scanPackageCaches: () => Promise<PackageCacheItem[]>;
  cleanPackageCache: (manager: PackageManagerName) => Promise<PackageCacheCleanResult>;
  openPackageCacheDirectory: (cachePath: string) => Promise<string>;
  listPortUsages: (query: PortUsageQuery) => Promise<PortUsageItem[]>;
  killPortProcess: (pid: number) => Promise<KillProcessResult>;
  getHostsDocument: () => Promise<HostsDocument>;
  saveHosts: (request: HostsSaveRequest) => Promise<HostsMutationResult>;
  listHostsBackups: () => Promise<HostsBackupItem[]>;
  restoreHostsBackup: (backupId: string, sourceHash: string) => Promise<HostsMutationResult>;
  flushDns: () => Promise<DnsFlushResult>;
}

export interface DesktopNotesApi {
  getSnapshot: () => Promise<DesktopNotesSnapshot>;
  openWindow: () => Promise<DesktopNotesSnapshot>;
  closeWindow: () => Promise<DesktopNotesSnapshot>;
  refresh: () => Promise<DesktopNotesSnapshot>;
  loadState: () => Promise<DesktopNotesState>;
  saveState: (state: DesktopNotesState) => Promise<DesktopNotesState>;
  saveRuntime: (update: DesktopNotesRuntimeUpdate) => Promise<DesktopNotesSnapshot>;
  updateContent: (update: DesktopNotesContentUpdate) => Promise<DesktopNotesSnapshot>;
  highlightBounds: () => Promise<DesktopNotesSnapshot>;
  onBoundsHighlight: (handler: (durationMs: number) => void) => () => void;
  takeBoundsHighlight: () => Promise<boolean>;
  setCompact: (compact: boolean) => Promise<void>;
  endBoundsHighlight: () => Promise<void>;
  onSnapshot: (handler: (snapshot: DesktopNotesSnapshot) => void) => () => void;
  onApplyState: (handler: (state: DesktopNotesState) => void) => () => void;
  onFlushRequest: (handler: () => DesktopNotesState | undefined) => () => void;
}

declare global {
  interface Window {
    clearNodeModules?: ClearNodeModulesApi;
    developerAssistant?: DeveloperAssistantApi;
    desktopNotes?: DesktopNotesApi;
  }
}
