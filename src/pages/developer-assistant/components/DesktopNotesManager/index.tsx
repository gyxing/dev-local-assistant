import { useEffect, useRef, useState } from 'react';
import { App, Button, Card, Descriptions, Input, InputNumber, Modal, Popconfirm, Select, Slider, Space, Table, Tag, Typography } from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  BorderOutlined,
  DesktopOutlined,
  FileTextOutlined,
  PushpinOutlined,
  SaveOutlined,
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
import StatusSwitch from '@/components/StatusSwitch';
import WorkspacePageHeader from '../WorkspacePageHeader';
import './index.less';

const { Text } = Typography;

// 方位图的键盘顺序按屏幕位置从上到下、从左到右。
const anchorOrder: Record<DesktopNotesAnchor, number> = {
  'top-left': 0,
  'top-right': 1,
  center: 2,
  'bottom-left': 3,
  'bottom-right': 4,
};
const positionPresets = listNotesWindowAnchors().sort((a, b) => anchorOrder[a.anchor] - anchorOrder[b.anchor]);

/**
 * 在主工具里管理便利贴的配置、贴纸、窗口位置和本地缓存。
 */
export default function DesktopNotesManager() {
  const { message } = App.useApp();
  const [snapshot, setSnapshot] = useState<DesktopNotesSnapshot>();
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'open' | 'close' | 'refresh'>();
  const [savingMode, setSavingMode] = useState(false);
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
  const desktopMode = snapshot?.windowOpen ? snapshot.desktopModeActive : (snapshot?.state.settings.desktopMode ?? false);

  useEffect(() => {
    const api = window.desktopNotes;
    if (!api) {
      return;
    }

    let active = true;
    let receivedPush = false;
    void api.getSnapshot().then((nextSnapshot) => {
      if (active && !receivedPush) {
        setSnapshot(nextSnapshot);
      }
    });
    const stop = api.onSnapshot((nextSnapshot) => {
      receivedPush = true;
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

  async function updateDesktopMode(enabled: boolean) {
    const api = window.desktopNotes;
    if (!api) return;

    setSavingMode(true);
    try {
      setSnapshot(await api.setDesktopMode(enabled));
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '切换桌面模式失败');
    } finally {
      setSavingMode(false);
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

    const { maxVisibleNotes, maxLinesPerNote, showPinnedOnly, opacity, fontSize } = settingsDraft;
    void updateContent({ settings: { maxVisibleNotes, maxLinesPerNote, showPinnedOnly, opacity, fontSize } }).then((saved) => {
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
      width: 64,
      render: (pinned: boolean) => (pinned ? <Tag color="gold">置顶</Tag> : <Tag>普通</Tag>),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 56,
      render: (color: string) => <span className="desktop-notes-manager__swatch" style={{ backgroundColor: color }} />,
    },
    {
      title: '位置',
      width: 108,
      render: (_, note) => `${Math.round(note.x)}, ${Math.round(note.y)}`,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 148,
      render: (updatedAt: number) => new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '操作',
      width: 108,
      render: (_, note) => (
        <Space size={4}>
          <Button type="link" size="small" disabled={!apiAvailable || savingContent} onClick={() => openNoteEditor(note)}>
            编辑
          </Button>
          <Popconfirm
            overlayClassName="desktop-notes-manager__delete-popover"
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
  const canPositionWindow = Boolean(apiAvailable && !savingContent && boundsDraft && snapshot?.workArea);
  const activeAnchor = boundsDraft && snapshot?.workArea
    ? matchNotesWindowAnchor(boundsDraft, snapshot.workArea)
    : undefined;

  return (
    <section className="desktop-notes-manager">
      <WorkspacePageHeader
        title="桌面便利贴"
        description="管理贴纸内容、显示方式和窗口位置。"
        status={<Tag color={snapshot?.windowOpen ? 'success' : 'default'}>{snapshot?.windowOpen ? '已打开' : '已关闭'}</Tag>}
        actions={<>
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
        </>}
      />

      <Card size="small" title={<Space size={7}><PushpinOutlined />运行与显示</Space>}>
        <div className="desktop-notes-manager__toggles">
          <div className="toolbox-setting-row">
            <div className="desktop-notes-manager__runtime-copy">
              <Text className="desktop-notes-manager__runtime-title">桌面模式</Text>
              <Text type="secondary" className="desktop-notes-manager__hint">
                置底、点击穿透、只读展示。可从托盘或这里关闭。
              </Text>
            </div>
            <StatusSwitch
              size="small"
              aria-label="桌面模式"
              className="desktop-notes-manager__runtime-switch"
              checked={desktopMode}
              loading={savingMode}
              disabled={!apiAvailable || !snapshot}
              onChange={(checked) => void updateDesktopMode(checked)}
            />
          </div>
          <div className="toolbox-setting-row">
            <Text className="desktop-notes-manager__runtime-title">只看置顶</Text>
            <StatusSwitch
              size="small"
              aria-label="只看置顶"
              disabled={!apiAvailable || !settingsDraft}
              checked={settingsDraft?.showPinnedOnly ?? false}
              onChange={(checked) => changeSettings({ showPinnedOnly: checked })}
            />
          </div>
        </div>
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
          <label className="desktop-notes-manager__field">
            <span>透明度 {settingsDraft ? `${Math.round(settingsDraft.opacity * 100)}%` : ''}</span>
            <Slider
              ariaLabelForHandle="透明度"
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
              ariaLabelForHandle="字号"
              min={12}
              max={28}
              step={1}
              disabled={!apiAvailable || !settingsDraft}
              value={settingsDraft?.fontSize}
              onChange={(value) => changeSettings({ fontSize: value })}
            />
          </label>
          <Button
            className="desktop-notes-manager__settings-apply"
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            disabled={!apiAvailable || savingContent || !settingsDraft}
            onClick={applySettings}
          >
            应用显示设置
          </Button>
        </div>
      </Card>

      <Card size="small" title={<Space size={7}><DesktopOutlined />窗口位置</Space>}>
        <div className="desktop-notes-manager__window">
          {snapshot?.windowOpen && !snapshot.desktopModeActive && snapshot.state.notes.length === 0 ? (
            <Text type="secondary" className="desktop-notes-manager__compact-hint">
              当前没有贴纸，便利贴窗口已收缩为右下角的操作按钮。添加贴纸或进入桌面模式后会恢复完整范围。
            </Text>
          ) : null}
          <div className="desktop-notes-manager__window-controls">
            <div className="desktop-notes-manager__window-main">
              <div className="desktop-notes-manager__window-fields">
                <label className="desktop-notes-manager__field desktop-notes-manager__field--display">
                  <span>显示器</span>
                  <Select
                    size="small"
                    value={snapshot?.activeDisplayId}
                    disabled={!apiAvailable || savingContent}
                    options={(snapshot?.displays ?? []).map((display) => ({ value: display.id, label: display.label }))}
                    onChange={(value) => void updateContent({ displayId: value })}
                  />
                </label>
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
                <div className="desktop-notes-manager__field">
                  <span>当前位置</span>
                  <span className="desktop-notes-manager__coordinates">
                    {boundsDraft ? `${Math.round(boundsDraft.x)}, ${Math.round(boundsDraft.y)}` : '—'}
                  </span>
                </div>
              </div>
            </div>
            <div className="desktop-notes-manager__position-tools">
              <div className="toolbox-position-panel toolbox-position-panel--preset">
                <span>位置预设</span>
                <div className="desktop-notes-manager__anchors" role="group" aria-label="窗口位置预设">
                  {positionPresets.map(({ anchor, label }) => {
                    const selected = activeAnchor === anchor;
                    return (
                      <Button
                        key={anchor}
                        className={`desktop-notes-manager__anchor desktop-notes-manager__anchor--${anchor}`}
                        size="small"
                        type={selected ? 'primary' : 'default'}
                        icon={<BorderOutlined />}
                        aria-label={label}
                        aria-pressed={selected}
                        title={label}
                        disabled={!canPositionWindow}
                        onClick={() => chooseAnchor(anchor)}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="toolbox-position-panel">
                <span>方向微调</span>
                <div className="desktop-notes-manager__dpad" role="group" aria-label="微调窗口位置">
                  <Button
                    className="desktop-notes-manager__direction desktop-notes-manager__direction--up"
                    size="small"
                    icon={<ArrowUpOutlined />}
                    aria-label="上移"
                    title="上移"
                    disabled={!canPositionWindow}
                    onClick={() => moveBounds('up')}
                  />
                  <Button
                    className="desktop-notes-manager__direction desktop-notes-manager__direction--left"
                    size="small"
                    icon={<ArrowLeftOutlined />}
                    aria-label="左移"
                    title="左移"
                    disabled={!canPositionWindow}
                    onClick={() => moveBounds('left')}
                  />
                  <Button
                    className="desktop-notes-manager__direction desktop-notes-manager__direction--right"
                    size="small"
                    icon={<ArrowRightOutlined />}
                    aria-label="右移"
                    title="右移"
                    disabled={!canPositionWindow}
                    onClick={() => moveBounds('right')}
                  />
                  <Button
                    className="desktop-notes-manager__direction desktop-notes-manager__direction--down"
                    size="small"
                    icon={<ArrowDownOutlined />}
                    aria-label="下移"
                    title="下移"
                    disabled={!canPositionWindow}
                    onClick={() => moveBounds('down')}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="desktop-notes-manager__window-footer">
            <Text type="secondary" className="desktop-notes-manager__placement">
              {boundsDraft && snapshot?.workArea ? describeNotesWindow(boundsDraft, snapshot.workArea) : '等待读取屏幕位置'}
            </Text>
            <Space size={8} className="desktop-notes-manager__window-actions">
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
                应用位置
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      <Card size="small" className="desktop-notes-manager__data" title={<Space size={7}><FileTextOutlined />贴纸列表</Space>}>
        <Table<DesktopNote>
          className="toolbox-data-table"
          rowKey="id"
          size="small"
          tableLayout="fixed"
          scroll={{ x: 680 }}
          columns={columns}
          dataSource={snapshot?.state.notes ?? []}
          pagination={false}
          locale={{ emptyText: cache?.exists ? '没有贴纸' : '尚未写入本地数据' }}
        />
      </Card>

      <Card size="small" title={<Space size={7}><SaveOutlined />本地缓存</Space>}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="文件" span="filled">
            <span className="desktop-notes-manager__cache-path">{cache?.filePath ?? '-'}</span>
          </Descriptions.Item>
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
          <StatusSwitch size="small" aria-label="置顶贴纸" checked={editPinned} onChange={setEditPinned} />
        </label>
      </Modal>
    </section>
  );
}
