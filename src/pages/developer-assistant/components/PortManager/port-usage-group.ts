import type { PortUsageItem } from '../../../../../shared/developer-tools-types';

const LISTENING_STATE = 'LISTENING';
const ESTABLISHED_STATE = 'ESTABLISHED';

export interface PortUsageGroup {
  id: string;
  protocol: string;
  localPort: number;
  pid: number;
  processName?: string;
  processPath?: string;
  commandLine?: string;
  items: PortUsageItem[];
  localAddressCount: number;
  listeningCount: number;
  establishedCount: number;
  otherStateCount: number;
}

function createGroupKey(item: PortUsageItem): string {
  // 同端口可能属于不同协议或进程，只有服务身份一致时才能合并展示。
  return JSON.stringify([item.localPort, item.protocol, item.pid, item.processPath ?? '']);
}

function createPortUsageGroup(id: string, items: PortUsageItem[]): PortUsageGroup {
  const firstItem = items[0];
  const listeningCount = items.filter((item) => item.state?.toUpperCase() === LISTENING_STATE).length;
  const establishedCount = items.filter((item) => item.state?.toUpperCase() === ESTABLISHED_STATE).length;

  return {
    id,
    protocol: firstItem.protocol,
    localPort: firstItem.localPort,
    pid: firstItem.pid,
    processName: firstItem.processName,
    processPath: firstItem.processPath,
    commandLine: firstItem.commandLine,
    items,
    localAddressCount: new Set(items.map((item) => item.localAddress)).size,
    listeningCount,
    establishedCount,
    otherStateCount: items.length - listeningCount - establishedCount,
  };
}

/**
 * 按端口、协议和进程身份合并套接字记录，原始记录保留在分组明细中。
 */
export function groupPortUsages(items: PortUsageItem[]): PortUsageGroup[] {
  const itemGroups = new Map<string, PortUsageItem[]>();

  items.forEach((item) => {
    const groupKey = createGroupKey(item);
    const groupItems = itemGroups.get(groupKey);
    if (groupItems) {
      groupItems.push(item);
      return;
    }

    itemGroups.set(groupKey, [item]);
  });

  return [...itemGroups.entries()].map(([id, groupItems]) => createPortUsageGroup(id, groupItems));
}
