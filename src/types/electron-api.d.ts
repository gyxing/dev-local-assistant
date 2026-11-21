import type { AppSettingsSnapshot, AppSettingsUpdate } from '../../shared/app-settings-types';
import type {
  DesktopNotesContentUpdate,
  DesktopNotesSnapshot,
  DesktopNotesState,
  DesktopNotesWindowState,
} from '../../shared/desktop-notes-types';
import type { TrayPanelApi } from '../../shared/tray-panel-types';
import type {
  CalendarHolidayYear,
  CalendarTimeInfo,
  DesktopCalendarSettings,
  DesktopCalendarSnapshot,
} from '../../shared/desktop-calendar-types';
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

export interface AppSettingsApi {
  getSnapshot: () => Promise<AppSettingsSnapshot>;
  save: (patch: AppSettingsUpdate) => Promise<AppSettingsSnapshot>;
}

export interface DesktopNotesApi {
  getSnapshot: () => Promise<DesktopNotesSnapshot>;
  openWindow: () => Promise<DesktopNotesSnapshot>;
  closeWindow: () => Promise<DesktopNotesSnapshot>;
  refresh: () => Promise<DesktopNotesSnapshot>;
  loadState: () => Promise<DesktopNotesWindowState>;
  setDesktopMode: (enabled: boolean) => Promise<DesktopNotesSnapshot>;
  saveState: (state: DesktopNotesState) => Promise<DesktopNotesState>;
  updateContent: (update: DesktopNotesContentUpdate) => Promise<DesktopNotesSnapshot>;
  highlightBounds: () => Promise<DesktopNotesSnapshot>;
  onBoundsHighlight: (handler: (durationMs: number) => void) => () => void;
  takeBoundsHighlight: () => Promise<boolean>;
  onSnapshot: (handler: (snapshot: DesktopNotesSnapshot) => void) => () => void;
  onApplyState: (handler: (state: DesktopNotesWindowState) => void) => () => void;
  onFlushRequest: (handler: () => DesktopNotesState | undefined) => () => void;
  onResumeEdits: (handler: () => void) => () => void;
}

export interface DesktopCalendarApi {
  getSnapshot: () => Promise<DesktopCalendarSnapshot>;
  openWindow: () => Promise<DesktopCalendarSnapshot>;
  closeWindow: () => Promise<DesktopCalendarSnapshot>;
  saveSettings: (settings: Partial<DesktopCalendarSettings>) => Promise<DesktopCalendarSnapshot>;
  onSnapshot: (handler: (snapshot: DesktopCalendarSnapshot) => void) => () => void;
  getHolidays: (year: number) => Promise<CalendarHolidayYear>;
  getTime: () => Promise<CalendarTimeInfo>;
  syncTime: () => Promise<CalendarTimeInfo>;
  onTimeChanged: (handler: (info: CalendarTimeInfo) => void) => () => void;
  onSettingsChanged: (handler: (settings: DesktopCalendarSettings) => void) => () => void;
}

declare global {
  interface Window {
    clearNodeModules?: ClearNodeModulesApi;
    developerAssistant?: DeveloperAssistantApi;
    appSettings?: AppSettingsApi;
    mainWindowMenu?: {
      getGroups: () => Promise<MainWindowMenuGroup[]>;
      runCommand: (id: number) => Promise<void>;
    };
    mainWindowAbout?: {
      getVersion: () => Promise<string>;
      openProjectHome: () => Promise<void>;
    };
    desktopNotes?: DesktopNotesApi;
    desktopCalendar?: DesktopCalendarApi;
    trayPanel?: TrayPanelApi;
  }
}
import type { MainWindowMenuGroup } from '@shared/main-window-appearance';
