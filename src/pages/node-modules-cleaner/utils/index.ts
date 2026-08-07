import type {
  DeleteTaskStatus,
  DirectoryHistoryItem,
  IgnoredProject,
  NodeModulesItem,
  NodeModulesItemStatus,
  ProtectedProject,
} from '@shared/task-types';

export const MAX_DIRECTORY_HISTORY_COUNT = 20;

export const statusTextMap: Record<NodeModulesItemStatus, string> = {
  found: '已发现',
  sizing: '统计中',
  ready: '可删除',
  'delete-pending': '待删除',
  deleting: '删除中',
  deleted: '已删除',
  'delete-paused': '已暂停',
  'delete-canceled': '本轮已取消',
  'delete-failed': '删除失败',
};

export const deleteTaskTextMap: Record<DeleteTaskStatus, string> = {
  deleting: '删除中',
  'delete-pausing': '等待当前项完成',
  'delete-paused': '已暂停',
  completed: '已完成',
  finished: '本轮已取消',
};

/**
 * 将字节数转换为适合界面展示的容量文本。
 */
export function formatBytes(value?: number): string {
  if (value === undefined) {
    return '统计中';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 根据删除/统计状态映射 AntD Tag 颜色，保证状态视觉反馈稳定一致。
 */
export function getItemStatusColor(status: NodeModulesItemStatus): string {
  if (status === 'deleted') {
    return 'green';
  }

  if (status === 'delete-failed') {
    return 'red';
  }

  if (status === 'deleting' || status === 'sizing') {
    return 'blue';
  }

  if (status === 'delete-canceled' || status === 'delete-paused') {
    return 'orange';
  }

  return 'default';
}

/**
 * 从文件路径中提取最后一级名称，用于用户没有手动命名时的默认展示。
 */
export function getPathName(targetPath: string): string {
  const normalizedPath = targetPath.replace(/[\\/]+$/, '');
  const parts = normalizedPath.split(/[\\/]+/);
  return parts.at(-1) || targetPath;
}

function normalizePathForCompare(targetPath: string): string {
  return targetPath.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * 按项目路径和 node_modules 路径排序，让扫描结果在重复扫描后仍然方便比对。
 */
export function compareNodeModulesItemPath(left: NodeModulesItem, right: NodeModulesItem): number {
  const projectPathResult = normalizePathForCompare(left.projectPath).localeCompare(
    normalizePathForCompare(right.projectPath),
  );

  if (projectPathResult !== 0) {
    return projectPathResult;
  }

  return normalizePathForCompare(left.nodeModulesPath).localeCompare(normalizePathForCompare(right.nodeModulesPath));
}

/**
 * 判断目标路径是否落在保护项目范围内，避免误删正在进行或明确保护的项目。
 */
export function isPathInProtectedProjects(targetPath: string, projects: ProtectedProject[]): boolean {
  const normalizedTargetPath = normalizePathForCompare(targetPath);

  return projects
    .filter((project) => project.enabled)
    .some((project) => {
      const normalizedProjectPath = normalizePathForCompare(project.projectPath);
      return (
        normalizedTargetPath === normalizedProjectPath ||
        normalizedTargetPath.startsWith(`${normalizedProjectPath}/`)
      );
    });
}

/**
 * 同时检查项目目录和 node_modules 目录，覆盖用户直接保护依赖目录的场景。
 */
export function isItemProtected(item: NodeModulesItem, projects: ProtectedProject[]): boolean {
  return (
    isPathInProtectedProjects(item.projectPath, projects) ||
    isPathInProtectedProjects(item.nodeModulesPath, projects)
  );
}

/**
 * 判断路径是否命中忽略列表，扫描结果展示和后续删除选择都复用同一套规则。
 */
export function isPathInIgnoredProjects(targetPath: string, projects: IgnoredProject[]): boolean {
  const normalizedTargetPath = normalizePathForCompare(targetPath);

  return projects.some((project) => {
    const normalizedProjectPath = normalizePathForCompare(project.projectPath);
    const normalizedNodeModulesPath = project.nodeModulesPath
      ? normalizePathForCompare(project.nodeModulesPath)
      : undefined;

    return (
      normalizedTargetPath === normalizedProjectPath ||
      normalizedTargetPath.startsWith(`${normalizedProjectPath}/`) ||
      normalizedTargetPath === normalizedNodeModulesPath
    );
  });
}

/**
 * 同时按项目路径和 node_modules 路径匹配，兼容用户从不同层级加入忽略的情况。
 */
export function isItemIgnored(item: NodeModulesItem, projects: IgnoredProject[]): boolean {
  return (
    isPathInIgnoredProjects(item.projectPath, projects) ||
    isPathInIgnoredProjects(item.nodeModulesPath, projects)
  );
}

/**
 * 生成下一份历史目录列表，并把最近使用的目录置顶。
 */
export function createNextDirectoryHistory(
  currentHistory: DirectoryHistoryItem[],
  targetPath: string,
  incrementScanCount: boolean,
): DirectoryHistoryItem[] {
  const normalizedPath = targetPath.trim();
  const currentItem = currentHistory.find(
    (item) => item.path.toLowerCase() === normalizedPath.toLowerCase(),
  );
  const nextItem: DirectoryHistoryItem = {
    id: currentItem?.id ?? `${Date.now()}-${currentHistory.length}`,
    name: currentItem?.name || getPathName(normalizedPath),
    path: normalizedPath,
    lastUsedAt: Date.now(),
    scanCount: (currentItem?.scanCount ?? 0) + (incrementScanCount ? 1 : 0),
  };

  return [nextItem, ...currentHistory.filter((item) => item.id !== nextItem.id)]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_DIRECTORY_HISTORY_COUNT);
}

/**
 * 将可选布尔值转成中文状态，失败诊断里比 true/false 更容易读。
 */
export function formatBooleanStatus(value: boolean | undefined): string {
  if (value === undefined) {
    return '未知';
  }

  return value ? '是' : '否';
}

/**
 * 从未知异常中提取可展示文案，避免 IPC 异常被吞掉后用户不知道发生了什么。
 */
export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}
