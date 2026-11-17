import { useEffect, useRef, useState } from 'react';
import { Button, Card, Descriptions, Input, InputNumber, Modal, Popconfirm, Slider, Space, Switch, Table, Tag, Typography, message } from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  BorderOutlined,
  CheckOutlined,
  CloseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type {
  DesktopNote,
  DesktopNoteSettings,
  DesktopNotesAnchor,
  DesktopNotesContentUpdate,
  DesktopNotesSnapshot,
  DesktopNotesWindowBounds,
} from '../../../../../shared/desktop-notes-types';
import {
  describeNotesWindow,
  listNotesWindowAnchors,
  matchNotesWindowAnchor,
  nudgeNotesWindow,
  placeNotesWindow,
} from '../../../../../shared/desktop-notes-placement';
import { formatBytes } from '../../../node-modules-cleaner/utils';
import './index.less';

const { Text, Title } = Typography;

/**
 * 在主工具里管理便利贴的配置、贴纸、窗口位置和本地缓存。
 */
export default function DesktopNotesManager() {
  const [snapshot, setSnapshot] = useState<DesktopNotesSnapshot>();
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'open' | 'close' | 'refresh'>();
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [highlightingBounds, setHighlightingBounds] = useState(false);
  const [boundsDraft, setBoundsDraft] = useState<DesktopNotesWindowBounds>();
  const [boundsDirty, setBoundsDirty] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<DesktopNoteSettings>();
  const settingsDirtyRef = useRef(false);
  const [editingNote, setEditingNote] = useState<DesktopNote>();
  const [editText, setEditText] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const apiAvailable = Boolean(window.desktopNotes);

  useEffect(() => {
    const api = window.desktopNotes;
    if (!api) {
      return;
    }

    let active = true;
    void api.getSnapshot().then((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
      }
    });
    const stop = api.onSnapshot((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      active = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!boundsDirty && snapshot?.windowBounds) {
      setBoundsDraft(snapshot.windowBounds);
    }
  }, [boundsDirty, snapshot?.windowBounds]);

  useEffect(() => {
    if (!settingsDirtyRef.current && snapshot?.state.settings) {
      setSettingsDraft(snapshot.state.settings);
    }
  }, [snapshot?.state.settings]);

  async function runWindowAction(action: 'open' | 'close' | 'refresh') {
    const api = window.desktopNotes;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setPendingAction(action);
    setLoading(true);
    try {
      const nextSnapshot =
        action === 'open' ? await api.openWindow() : action === 'close' ? await api.closeWindow() : await api.refresh();
      setSnapshot(nextSnapshot);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '便利贴操作失败');
    } finally {
      setPendingAction(undefined);
      setLoading(false);
    }
  }

  async function updateRuntime(update: { launchAtLogin?: boolean; quitWhenMainWindowCloses?: boolean }) {
    const api = window.desktopNotes;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setSavingRuntime(true);
    try {
      setSnapshot(await api.saveRuntime(update));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存运行设置失败');
    } finally {
      setSavingRuntime(false);
    }
  }

  async function updateContent(update: DesktopNotesContentUpdate) {
    const api = window.desktopNotes;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return false;
    }

    setSavingContent(true);
    try {
      setSnapshot(await api.updateContent(update));
      return true;
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存便利贴失败');
      return false;
    } finally {
      setSavingContent(false);
    }
  }

  function changeSettings(patch: Partial<DesktopNoteSettings>) {
    setSettingsDraft((current) => (current ? { ...current, ...patch } : current));
    settingsDirtyRef.current = true;
  }

  function chooseAnchor(anchor: DesktopNotesAnchor) {
    if (!boundsDraft || !snapshot?.workArea) {
      return;
    }

    setBoundsDirty(true);
    setBoundsDraft(placeNotesWindow(anchor, boundsDraft, snapshot.workArea));
  }

  function moveBounds(direction: 'up' | 'down' | 'left' | 'right') {
    if (!boundsDraft || !snapshot?.workArea) {
      return;
    }

    setBoundsDirty(true);
    setBoundsDraft(nudgeNotesWindow(boundsDraft, direction, snapshot.workArea));
  }

  function applySettings() {
    if (!settingsDraft) {
      return;
    }

    void updateContent({ settings: settingsDraft }).then((saved) => {
      settingsDirtyRef.current = false;
      if (!saved && snapshot?.state.settings) {
        setSettingsDraft(snapshot.state.settings);
      }
    });
  }

  function openNoteEditor(note: DesktopNote) {
    setEditingNote(note);
    setEditText(note.text);
    setEditPinned(note.pinned);
  }

  async function highlightBounds() {
    const api = window.desktopNotes;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setHighlightingBounds(true);
    try {
      setSnapshot(await api.highlightBounds());
      message.success('便利贴区域已高亮 3 秒');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '检测便利贴范围失败');
    } finally {
      setHighlightingBounds(false);
    }
  }

  const columns: TableColumnsType<DesktopNote> = [
    {
      title: '内容',
      dataIndex: 'text',
      ellipsis: true,
    },
    {
      title: '置顶',
      dataIndex: 'pinned',
      width: 80,
      render: (pinned: boolean) => (pinned ? <Tag color="gold">置顶</Tag> : <Tag>普通</Tag>),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 80,
      render: (color: string) => <span className="desktop-notes-manager__swatch" style={{ backgroundColor: color }} />,
    },
    {
      title: '位置',
      width: 120,
      render: (_, note) => `${Math.round(note.x)}, ${Math.round(note.y)}`,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (updatedAt: number) => new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '操作',
      width: 120,
      render: (_, note) => (
        <Space size={4}>
          <Button type="link" size="small" disabled={!apiAvailable || savingContent} onClick={() => openNoteEditor(note)}>
            编辑
          </Button>
          <Popconfirm
            title="删除这张贴纸？"
            description={note.text}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={!apiAvailable || savingContent}
            onConfirm={() => updateContent({ deleteNoteId: note.id })}
          >
            <Button type="link" size="small" danger disabled={!apiAvailable || savingContent}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const cache = snapshot?.cache;

  return (
    <section className="desktop-notes-manager">
      <header className="desktop-notes-manager__header">
        <div className="desktop-notes-manager__heading">
          <div className="desktop-notes-manager__title-row">
            <Title level={5} className="desktop-notes-manager__title">
              桌面便利贴
            </Title>
            <Tag color={snapshot?.windowOpen ? 'success' : 'default'}>{snapshot?.windowOpen ? '已打开' : '已关闭'}</Tag>
          </div>
          <Text type="secondary">管理配置、贴纸、窗口位置和本地缓存。</Text>
        </div>
        <Space size={8} className="desktop-notes-manager__actions">
          {snapshot?.windowOpen ? (
            <Button
              size="small"
              icon={<CloseOutlined />}
              loading={pendingAction === 'close'}
              disabled={!apiAvailable || loading}
              onClick={() => void runWindowAction('close')}
            >
              关闭
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={pendingAction === 'open'}
              disabled={!apiAvailable || loading}
              onClick={() => void runWindowAction('open')}
            >
              打开
            </Button>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={pendingAction === 'refresh'}
            disabled={!apiAvailable || loading}
            onClick={() => void runWindowAction('refresh')}
          >
            刷新
          </Button>
        </Space>
      </header>

      <Card size="small" title="运行">
        <div className="desktop-notes-manager__runtime">
          <div className="desktop-notes-manager__runtime-item">
            <div>
              <Text className="desktop-notes-manager__runtime-title">开机自启动</Text>
              <Text type="secondary" className="desktop-notes-manager__hint">
                {snapshot?.packaged
                  ? '开机后打开主窗口，并恢复上次的便利贴窗口。'
                  : '开发模式只记住选择，安装后的程序才会写入开机启动项。'}
              </Text>
            </div>
            <Switch
              checked={snapshot?.runtime.launchAtLogin ?? false}
              loading={savingRuntime}
              disabled={!apiAvailable}
              onChange={(checked) => void updateRuntime({ launchAtLogin: checked })}
            />
          </div>
          <div className="desktop-notes-manager__runtime-item">
            <div>
              <Text className="desktop-notes-manager__runtime-title">关闭主窗口时退出</Text>
              <Text type="secondary" className="desktop-notes-manager__hint">
                {snapshot?.runtime.quitWhenMainWindowCloses
                  ? '关闭主窗口时退出应用，并一起关闭便利贴。'
                  : '关闭主窗口时隐藏到托盘，便利贴继续留在桌面。'}
              </Text>
            </div>
            <Switch
              checked={snapshot?.runtime.quitWhenMainWindowCloses ?? false}
              loading={savingRuntime}
              disabled={!apiAvailable}
              onChange={(checked) => void updateRuntime({ quitWhenMainWindowCloses: checked })}
            />
          </div>
        </div>
      </Card>

      <Card size="small" title="配置">
        <div className="desktop-notes-manager__settings">
          <label className="desktop-notes-manager__field">
            <span>最大显示</span>
            <InputNumber
              size="small"
              min={1}
              max={20}
              disabled={!apiAvailable || !settingsDraft}
              value={settingsDraft?.maxVisibleNotes}
              onChange={(value) => {
                if (typeof value === 'number') {
                  changeSettings({ maxVisibleNotes: value });
                }
              }}
            />
          </label>
          <label className="desktop-notes-manager__field">
            <span>每张行数</span>
            <InputNumber
              size="small"
              min={1}
              max={20}
              disabled={!apiAvailable || !settingsDraft}
              value={settingsDraft?.maxLinesPerNote}
              onChange={(value) => {
                if (typeof value === 'number') {
                  changeSettings({ maxLinesPerNote: value });
                }
              }}
            />
          </label>
          <label className="desktop-notes-manager__field desktop-notes-manager__field--switch">
            <span>只看置顶</span>
            <Switch
              size="small"
              disabled={!apiAvailable || !settingsDraft}
              checked={settingsDraft?.showPinnedOnly ?? false}
              onChange={(checked) => changeSettings({ showPinnedOnly: checked })}
            />
          </label>
          <label className="desktop-notes-manager__field">
            <span>透明度 {settingsDraft ? `${Math.round(settingsDraft.opacity * 100)}%` : ''}</span>
            <Slider
              min={0.35}
              max={1}
              step={0.05}
              disabled={!apiAvailable || !settingsDraft}
              value={settingsDraft?.opacity}
              onChange={(value) => changeSettings({ opacity: value })}
            />
          </label>
          <label className="desktop-notes-manager__field">
            <span>字号 {settingsDraft ? `${settingsDraft.fontSize}px` : ''}</span>
            <Slider
              min={12}
              max={28}
              step={1}
              disabled={!apiAvailable || !settingsDraft}
              value={settingsDraft?.fontSize}
              onChange={(value) => changeSettings({ fontSize: value })}
            />
          </label>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            disabled={!apiAvailable || savingContent || !settingsDraft}
            onClick={applySettings}
          >
            应用
          </Button>
        </div>
      </Card>

      <Card size="small" title="窗口">
        <div className="desktop-notes-manager__window">
          {snapshot?.windowOpen && snapshot.state.notes.length === 0 ? (
            <Text type="secondary" className="desktop-notes-manager__compact-hint">
              当前没有贴纸，便利贴窗口已收缩为右下角的新建按钮；窗口设置将在添加贴纸后生效。
            </Text>
          ) : null}
          <label className="desktop-notes-manager__field">
            <span>宽度</span>
            <InputNumber
              min={320}
              max={2400}
              size="small"
              disabled={!apiAvailable || savingContent || !boundsDraft}
              value={boundsDraft?.width}
              onChange={(value) => {
                if (typeof value !== 'number' || !boundsDraft || !snapshot?.workArea) {
                  return;
                }
                const anchor = matchNotesWindowAnchor(boundsDraft, snapshot.workArea);
                setBoundsDirty(true);
                setBoundsDraft(
                  anchor
                    ? placeNotesWindow(anchor, { width: value, height: boundsDraft.height }, snapshot.workArea)
                    : { ...boundsDraft, width: value },
                );
              }}
            />
          </label>
          <label className="desktop-notes-manager__field">
            <span>高度</span>
            <InputNumber
              min={240}
              max={1600}
              size="small"
              disabled={!apiAvailable || savingContent || !boundsDraft}
              value={boundsDraft?.height}
              onChange={(value) => {
                if (typeof value !== 'number' || !boundsDraft || !snapshot?.workArea) {
                  return;
                }
                const anchor = matchNotesWindowAnchor(boundsDraft, snapshot.workArea);
                setBoundsDirty(true);
                setBoundsDraft(
                  anchor
                    ? placeNotesWindow(anchor, { width: boundsDraft.width, height: value }, snapshot.workArea)
                    : { ...boundsDraft, height: value },
                );
              }}
            />
          </label>
          <div className="desktop-notes-manager__anchors" aria-label="窗口位置">
            {listNotesWindowAnchors().map((item) => (
              <Button
                key={item.anchor}
                size="small"
                type={
                  boundsDraft && snapshot?.workArea && matchNotesWindowAnchor(boundsDraft, snapshot.workArea) === item.anchor
                    ? 'primary'
                    : 'default'
                }
                disabled={!apiAvailable || savingContent || !boundsDraft || !snapshot?.workArea}
                onClick={() => chooseAnchor(item.anchor)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="desktop-notes-manager__nudge" aria-label="微调窗口位置">
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={!apiAvailable || savingContent || !boundsDraft}
              onClick={() => moveBounds('up')}
            >
              上
            </Button>
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={!apiAvailable || savingContent || !boundsDraft}
              onClick={() => moveBounds('down')}
            >
              下
            </Button>
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              disabled={!apiAvailable || savingContent || !boundsDraft}
              onClick={() => moveBounds('left')}
            >
              左
            </Button>
            <Button
              size="small"
              icon={<ArrowRightOutlined />}
              disabled={!apiAvailable || savingContent || !boundsDraft}
              onClick={() => moveBounds('right')}
            >
              右
            </Button>
          </div>
          <Text type="secondary" className="desktop-notes-manager__placement">
            {boundsDraft && snapshot?.workArea ? describeNotesWindow(boundsDraft, snapshot.workArea) : '等待读取屏幕位置'}
          </Text>
          <Button
            size="small"
            icon={<BorderOutlined />}
            loading={highlightingBounds}
            disabled={!apiAvailable || !snapshot?.windowOpen}
            title={snapshot?.windowOpen ? undefined : '请先打开便利贴窗口'}
            onClick={() => void highlightBounds()}
          >
            检测范围
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            disabled={!apiAvailable || savingContent || !boundsDraft}
            onClick={() => {
              if (!boundsDraft) {
                return;
              }
              void updateContent({ windowBounds: boundsDraft }).then((saved) => {
                if (saved) {
                  setBoundsDirty(false);
                }
              });
            }}
          >
            应用
          </Button>
        </div>
      </Card>

      <Card size="small" className="desktop-notes-manager__data" title="数据">
        <Table<DesktopNote>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={snapshot?.state.notes ?? []}
          pagination={false}
          locale={{ emptyText: cache?.exists ? '没有贴纸' : '尚未写入本地数据' }}
        />
      </Card>

      <Card size="small" title="缓存">
        <Descriptions column={1} size="small">
          <Descriptions.Item label="文件">{cache?.filePath ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">{cache?.exists ? '已生成' : '尚未生成'}</Descriptions.Item>
          <Descriptions.Item label="大小">{cache?.exists ? formatBytes(cache.size) : '-'}</Descriptions.Item>
          <Descriptions.Item label="最后写入">
            {cache?.updatedAt ? new Date(cache.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title="编辑贴纸"
        open={Boolean(editingNote)}
        okText="保存"
        cancelText="取消"
        confirmLoading={savingContent}
        onCancel={() => setEditingNote(undefined)}
        onOk={() => {
          if (!editingNote) {
            return;
          }
          void updateContent({
            note: { id: editingNote.id, text: editText, pinned: editPinned },
          }).then(() => setEditingNote(undefined));
        }}
      >
        <Input.TextArea rows={4} value={editText} onChange={(event) => setEditText(event.target.value)} />
        <label className="desktop-notes-manager__edit-pin">
          <span>置顶</span>
          <Switch size="small" checked={editPinned} onChange={setEditPinned} />
        </label>
      </Modal>
    </section>
  );
}
