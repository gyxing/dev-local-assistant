export type PackageManagerName = 'npm' | 'pnpm' | 'yarn';

export type PackageCacheStatus = 'ready' | 'missing' | 'unavailable' | 'failed';

export interface PackageCacheItem {
  manager: PackageManagerName;
  label: string;
  cachePath?: string;
  exists: boolean;
  sizeBytes?: number;
  fileCount?: number;
  status: PackageCacheStatus;
  errorMessage?: string;
}

export interface PackageCacheCleanResult {
  manager: PackageManagerName;
  success: boolean;
  message: string;
  output?: string;
}

export interface PortUsageItem {
  id: string;
  protocol: string;
  localAddress: string;
  localPort: number;
  state?: string;
  pid: number;
  processName?: string;
  processPath?: string;
}

export interface KillProcessResult {
  success: boolean;
  message: string;
}
