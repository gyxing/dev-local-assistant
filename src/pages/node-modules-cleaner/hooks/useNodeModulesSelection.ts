import { useEffect, useMemo, useState } from 'react';
import type { IgnoredProject, NodeModulesItem, ProtectedProject } from '@shared/task-types';
import { compareNodeModulesItemPath, isItemIgnored, isItemProtected } from '../utils';

/**
 * 集中维护列表展示、选中项和可删除项，避免页面组件同时处理 UI 与派生数据规则。
 */
export default function useNodeModulesSelection(
  items: NodeModulesItem[],
  ignoredProjects: IgnoredProject[],
  protectedProjects: ProtectedProject[],
) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const visibleItems = useMemo(
    () => items.filter((item) => !isItemIgnored(item, ignoredProjects)).sort(compareNodeModulesItemPath),
    [ignoredProjects, items],
  );

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedRowKeys.includes(item.id)),
    [selectedRowKeys, visibleItems],
  );

  const selectedDeletableItems = useMemo(
    () => selectedItems.filter((item) => !isItemProtected(item, protectedProjects)),
    [protectedProjects, selectedItems],
  );

  const selectedSize = useMemo(
    () => selectedDeletableItems.reduce((total, item) => total + (item.sizeBytes ?? 0), 0),
    [selectedDeletableItems],
  );

  const sizedCount = useMemo(
    () => visibleItems.filter((item) => item.sizeBytes !== undefined).length,
    [visibleItems],
  );

  useEffect(() => {
    setSelectedRowKeys((currentKeys) =>
      currentKeys.filter((itemId) => {
        const item = items.find((currentItem) => currentItem.id === itemId);
        return !item || (!isItemProtected(item, protectedProjects) && !isItemIgnored(item, ignoredProjects));
      }),
    );
  }, [ignoredProjects, items, protectedProjects]);

  return {
    selectedDeletableItems,
    selectedRowKeys,
    selectedSize,
    setSelectedRowKeys,
    sizedCount,
    visibleItems,
  };
}
