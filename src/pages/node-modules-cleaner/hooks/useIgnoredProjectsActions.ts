import { App } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import type { IgnoredProject, NodeModulesItem } from '@shared/task-types';
import { getPathName } from '../utils';

interface UseIgnoredProjectsActionsOptions {
  ignoredProjects: IgnoredProject[];
  saveIgnoredProjects: (nextProjects: IgnoredProject[]) => Promise<void>;
  setSelectedRowKeys: Dispatch<SetStateAction<string[]>>;
}

/**
 * 封装忽略项目相关动作，确保列表剔除和配置持久化保持同步。
 */
export default function useIgnoredProjectsActions({
  ignoredProjects,
  saveIgnoredProjects,
  setSelectedRowKeys,
}: UseIgnoredProjectsActionsOptions) {
  const { modal, message } = App.useApp();
  async function handleIgnoreItem(item: NodeModulesItem) {
    const exists = ignoredProjects.some(
      (project) => project.projectPath.toLowerCase() === item.projectPath.toLowerCase(),
    );
    if (exists) {
      message.warning('该项目已在忽略列表中');
      return;
    }

    const nextIgnoredProjects: IgnoredProject[] = [
      ...ignoredProjects,
      {
        id: `${Date.now()}-${ignoredProjects.length}`,
        name: item.projectName || getPathName(item.projectPath),
        projectPath: item.projectPath,
        nodeModulesPath: item.nodeModulesPath,
        createdAt: Date.now(),
      },
    ];

    setSelectedRowKeys((currentKeys) => currentKeys.filter((itemId) => itemId !== item.id));
    try {
      await saveIgnoredProjects(nextIgnoredProjects);
      message.success('项目已忽略');
    } catch {
      // 保存失败时保留当前列表，让用户可以修正后重试。
    }
  }

  async function handleRestoreIgnoredProject(projectId: string) {
    const nextIgnoredProjects = ignoredProjects.filter((project) => project.id !== projectId);
    try {
      await saveIgnoredProjects(nextIgnoredProjects);
      message.success('已取消忽略');
    } catch {
      // 取消忽略需要持久化成功才算完成，失败时保留原状态提示用户重试。
    }
  }

  function handleClearIgnoredProjects() {
    modal.confirm({
      autoFocusButton: 'cancel',
      title: '确认清空忽略项目',
      content: '清空后不会删除任何文件，重新扫描时这些项目会再次出现在列表中。',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await saveIgnoredProjects([]);
          message.success('忽略项目已清空');
        } catch {
          // saveIgnoredProjects 已统一提示错误，这里只阻止确认流程静默失败。
        }
      },
    });
  }

  return {
    handleClearIgnoredProjects,
    handleIgnoreItem,
    handleRestoreIgnoredProject,
  };
}
