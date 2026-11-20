import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import { App, Button, Input, Modal, Space, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, FolderAddOutlined, PlusOutlined } from '@ant-design/icons';
import type { ProtectedProject } from '@shared/task-types';
import { getPathName } from '../../utils';
import StatusSwitch from '@/components/StatusSwitch';
import './index.less';

interface ProtectedProjectsModalProps {
  projects: ProtectedProject[];
  onSelectDirectory: () => Promise<string | undefined>;
  onSave: (projects: ProtectedProject[]) => Promise<void>;
}

export interface ProtectedProjectsModalRef {
  open: () => void;
}

/**
 * 管理保护项目列表，防止用户误扫或误删正在进行中的项目目录。
 */
function ProtectedProjectsModal({
  projects,
  onSelectDirectory,
  onSave,
}: ProtectedProjectsModalProps, ref: Ref<ProtectedProjectsModalRef>) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [draftProjects, setDraftProjects] = useState<ProtectedProject[]>([]);
  const [manualPath, setManualPath] = useState('');
  const [saving, setSaving] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => {
      setDraftProjects(projects);
      setManualPath('');
      setOpen(true);
    },
  }), [projects]);

  useEffect(() => {
    if (open) {
      setDraftProjects(projects);
      setManualPath('');
    }
  }, [open, projects]);

  function addProject(projectPath: string) {
    const normalizedPath = projectPath.trim();
    if (!normalizedPath) {
      return;
    }

    const exists = draftProjects.some(
      (project) => project.projectPath.toLowerCase() === normalizedPath.toLowerCase(),
    );
    if (exists) {
      message.warning('该项目已在保护列表中');
      return;
    }

    setDraftProjects((currentProjects) => [
      ...currentProjects,
      {
        id: `${Date.now()}-${currentProjects.length}`,
        name: getPathName(normalizedPath),
        projectPath: normalizedPath,
        enabled: true,
        createdAt: Date.now(),
      },
    ]);
  }

  async function handleSelectDirectory() {
    const selectedPath = await onSelectDirectory();
    if (selectedPath) {
      addProject(selectedPath);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draftProjects);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function closeModal() {
    setOpen(false);
    setManualPath('');
  }

  function updateProject(projectId: string, patch: Partial<ProtectedProject>) {
    setDraftProjects((currentProjects) =>
      currentProjects.map((project) => (project.id === projectId ? { ...project, ...patch } : project)),
    );
  }

  const columns: TableColumnsType<ProtectedProject> = [
    {
      title: '启用',
      width: 80,
      render: (_, project) => (
        <StatusSwitch
          checked={project.enabled}
          onChange={(enabled) => updateProject(project.id, { enabled })}
          aria-label="启用保护项目"
        />
      ),
    },
    {
      title: '项目名',
      width: 180,
      render: (_, project) => (
        <Input
          value={project.name}
          onChange={(event) => updateProject(project.id, { name: event.target.value })}
          aria-label="保护项目名"
        />
      ),
    },
    {
      title: '路径',
      dataIndex: 'projectPath',
      ellipsis: true,
    },
    {
      title: '操作',
      width: 80,
      render: (_, project) => (
        <Button
          danger
          icon={<DeleteOutlined />}
          aria-label="移除保护项目"
          onClick={() =>
            setDraftProjects((currentProjects) =>
              currentProjects.filter((currentProject) => currentProject.id !== project.id),
            )
          }
        />
      ),
    },
  ];

  return (
    <Modal
      title="保护项目配置"
      open={open}
      width={820}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleSave}
      onCancel={closeModal}
    >
      <Space className="protected-projects-modal__form" direction="vertical" size={12}>
        <Space.Compact className="protected-projects-modal__input">
          <Input
            value={manualPath}
            aria-label="项目路径"
            placeholder="输入项目路径"
            onChange={(event) => setManualPath(event.target.value)}
            onPressEnter={() => {
              addProject(manualPath);
              setManualPath('');
            }}
          />
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              addProject(manualPath);
              setManualPath('');
            }}
          >
            添加
          </Button>
          <Button icon={<FolderAddOutlined />} onClick={handleSelectDirectory}>
            选择目录
          </Button>
        </Space.Compact>
        <Table<ProtectedProject>
          className="toolbox-data-table"
          rowKey="id"
          columns={columns}
          dataSource={draftProjects}
          pagination={false}
          size="small"
          scroll={{ y: 260 }}
        />
      </Space>
    </Modal>
  );
}

export default forwardRef(ProtectedProjectsModal);
