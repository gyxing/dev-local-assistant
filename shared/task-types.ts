import type { DesktopCalendarSettings } from './desktop-calendar-types';
import type { AppSettingsPreferences } from './app-settings-types';

export type NodeModulesSource = 'package-json' | 'orphan-node-modules';

export type DeleteMode = 'trash' | 'permanent';

export interface DeleteFailureDetail {
  mode: DeleteMode;
  nodeModulesPath: string;
  resolvedPath: string;
  errorName?: string;
  errorCode?: string;
  errorSyscall?: string;
  errorPath?: string;
  errorMessage: string;
  existsBeforeDelete?: boolean;
  existsAfterFailure?: boolean;
  canAccessAfterFailure?: boolean;
  diagnosticMessage: string;
  suggestion: string;
}

export interface ProtectedProject {
  id: string;
  name: string;
  projectPath: string;
  enabled: boolean;
  reason?: string;
  createdAt: number;
}

export interface DirectoryHistoryItem {
  id: string;
  name: string;
  path: string;
  lastUsedAt: number;
  scanCount: number;
}

export interface IgnoredProject {
  id: string;
  name: string;
  projectPath: string;
  nodeModulesPath?: string;
  reason?: string;
  createdAt: number;
}

/** 应用运行方式。关闭主窗口的默认行为是隐藏到托盘，不退出进程。 */
export interface AppRuntimePreferences extends AppSettingsPreferences {
  notesWindowOpen: boolean;
}

export const DEFAULT_APP_RUNTIME_PREFERENCES: AppRuntimePreferences = {
  launchAtLogin: false,
  quitWhenMainWindowCloses: false,
  notesWindowOpen: false,
};

export interface AppConfig {
  protectedProjects: ProtectedProject[];
  directoryHistory: DirectoryHistoryItem[];
  ignoredProjects: IgnoredProject[];
  runtime: AppRuntimePreferences;
  calendar: DesktopCalendarSettings;
}

export type NodeModulesItemStatus =
  | 'found'
  | 'sizing'
  | 'ready'
  | 'delete-pending'
  | 'deleting'
  | 'deleted'
  | 'delete-paused'
  | 'delete-canceled'
  | 'delete-failed';

export interface NodeModulesItem {
  id: string;
  projectName: string;
  projectPath: string;
  nodeModulesPath: string;
  source: NodeModulesSource;
  sizeBytes?: number;
  fileCount?: number;
  status: NodeModulesItemStatus;
  riskLevel: 'normal' | 'attention';
  errorMessage?: string;
  failureDetail?: DeleteFailureDetail;
}

export type ScanTaskStatus = 'idle' | 'scanning' | 'scan-paused' | 'completed' | 'failed';

export type DeleteTaskStatus =
  | 'deleting'
  | 'delete-pausing'
  | 'delete-paused'
  | 'completed'
  | 'finished';

export interface DeleteTaskProgress {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  currentItemId?: string;
}

export interface DeleteTask {
  id: string;
  mode: DeleteMode;
  status: DeleteTaskStatus;
  currentItemId?: string;
  completedItemIds: string[];
  pendingItemIds: string[];
  failedItemIds: string[];
}

export type TaskEvent =
  | { type: 'scan:item-found'; item: NodeModulesItem }
  | { type: 'scan:status'; taskId: string; status: ScanTaskStatus; message?: string }
  | { type: 'size:updated'; itemId: string; sizeBytes: number; fileCount: number }
  | { type: 'size:failed'; itemId: string; errorMessage: string }
  | {
      type: 'delete:status';
      taskId: string;
      status: DeleteTaskStatus;
      currentItemId?: string;
      progress: DeleteTaskProgress;
    }
  | {
      type: 'delete:item-updated';
      itemId: string;
      status: NodeModulesItemStatus;
      errorMessage?: string;
      failureDetail?: DeleteFailureDetail;
    };
