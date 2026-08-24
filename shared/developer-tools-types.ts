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

/** 端口查询条件，用于明确区分指定端口查询与全部监听端口查询。 */
export interface PortUsageQuery {
  ports?: number[];
  scope: 'all' | 'listening';
}

export interface PortUsageItem {
  id: string;
  protocol: string;
  localAddress: string;
  remoteAddress?: string;
  localPort: number;
  state?: string;
  pid: number;
  processName?: string;
  processPath?: string;
  commandLine?: string;
}

export interface KillProcessResult {
  success: boolean;
  message: string;
}
