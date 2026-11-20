import {
  ArrowRightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  FileTextOutlined,
  LogoutOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TrayPanelAction, TrayPanelResult, TrayPanelState } from '../../../shared/tray-panel-types';
import './index.less';

interface Feedback {
  label: string;
  message: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
}

type RowVariant = 'main' | 'header' | 'option' | 'action' | 'quit';

interface PanelRowProps {
  action: TrayPanelAction;
  variant: RowVariant;
  label: string;
  accessibleLabel?: string;
  icon?: ReactNode;
  checked?: boolean;
  unavailableReason?: string;
  feedback?: Feedback;
  disabled: boolean;
  unavailable: boolean;
  pending: boolean;
  onClick: () => void;
  onUnavailable: (reason: string) => void;
}

/** 将已有操作结果压缩为行内状态，完整提示保留给悬停和辅助技术。 */
function feedbackFor(action: TrayPanelAction, result: TrayPanelResult): Feedback | undefined {
  if (!result.ok) {
    return {
      label: action === 'sync-time' ? '校时失败' : '操作失败',
      message: result.message ?? '操作未完成，请重试。',
      tone: 'error',
    };
  }

  if (action === 'sync-time') {
    if (result.message === '已按网络时间校准。') {
      return { label: '已校准', message: result.message, tone: 'success' };
    }
    if (result.message === '网络校时失败，继续使用本机时间。') {
      return { label: '使用本机时间', message: result.message, tone: 'warning' };
    }
  }

  if (action === 'highlight-notes' && result.state.notes.windowOpen) {
    return { label: '已高亮', message: '已高亮便利贴窗口范围。', tone: 'success' };
  }

  if ((action === 'toggle-notes-mode' && !result.state.notes.windowOpen)
    || (action === 'toggle-calendar-theme' && !result.state.calendar.windowOpen)) {
    return { label: '下次显示生效', message: '设置将在下次显示时应用。', tone: 'neutral' };
  }

  if (result.message) {
    return {
      label: action === 'toggle-notes' ? '交互模式' : '查看结果',
      message: result.message,
      tone: 'warning',
    };
  }
}

/** 开关和普通操作共用一行按钮，状态标记独立于键盘焦点。 */
function PanelRow({
  action, variant, label, accessibleLabel, icon, checked, unavailableReason,
  feedback, disabled, unavailable, pending, onClick, onUnavailable,
}: PanelRowProps) {
  const switchRow = checked !== undefined;
  const statusLabel = pending ? (action === 'sync-time' ? '校时中' : '处理中') : feedback?.label;
  const description = pending ? statusLabel : feedback?.message ?? unavailableReason;
  const descriptionId = description ? `tray-panel-description-${action}` : undefined;
  const blocked = disabled || pending;
  const rowIcon = icon ? <span className="tray-panel-icon" aria-hidden="true">{icon}</span> : null;

  return (
    <button
      className={`tray-panel-row tray-panel-row--${variant}${unavailable ? ' is-unavailable' : ''}`}
      type="button"
      role={switchRow ? 'switch' : undefined}
      aria-label={accessibleLabel ?? label}
      aria-checked={checked}
      aria-disabled={blocked}
      aria-busy={pending}
      aria-describedby={descriptionId}
      title={description ?? accessibleLabel}
      onClick={() => {
        // 同组操作暂时锁定但保留焦点，业务不可用时只解释原因。
        if (!blocked) onClick();
        else if (unavailableReason && !pending) onUnavailable(unavailableReason);
      }}
    >
      {variant !== 'action' ? rowIcon : null}
      <span className="tray-panel-label">{label}</span>
      {statusLabel ? (
        <span className={`tray-panel-row-status is-${pending ? 'neutral' : feedback?.tone ?? 'neutral'}`}>
          {statusLabel}
        </span>
      ) : null}
      {switchRow ? <span className="tray-panel-switch" aria-hidden="true" /> : null}
      {variant === 'action' ? rowIcon : null}
      {variant === 'main' ? <ArrowRightOutlined className="tray-panel-entry-arrow" aria-hidden="true" /> : null}
      {description ? <span className="tray-panel-sr-only" id={descriptionId}>{description}</span> : null}
    </button>
  );
}

/** 托盘窗口的快捷控制页面，操作状态以主进程推送为准。 */
export default function TrayPanelPage() {
  const latestState = useRef<TrayPanelState>();
  const inFlight = useRef(new Set<TrayPanelAction>());
  const [state, setState] = useState<TrayPanelState>();
  const [feedback, setFeedback] = useState<Feedback & { action: TrayPanelAction }>();

  const applyState = useCallback((next: TrayPanelState) => {
    if (latestState.current && next.revision < latestState.current.revision) return;

    // 同一窗口会被复用，重新打开时清理上一次反馈。
    if (next.openSequence !== latestState.current?.openSequence) setFeedback(undefined);
    latestState.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const api = window.trayPanel;
    if (!api) return;

    let active = true;
    const unsubscribe = api.onStateChanged(applyState);
    void api.ready().then((initial) => {
      if (active) applyState(initial);
    }).catch(() => {
      // 主进程会在握手超时后切回原生菜单。
      if (active) setFeedback({
        action: 'open-main',
        label: '未连接',
        message: '无法连接托盘，请从通知区域重新打开。',
        tone: 'error',
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyState]);

  async function run(action: TrayPanelAction) {
    const api = window.trayPanel;
    const current = latestState.current;
    if (!api || !current || current.disabled.includes(action) || inFlight.current.has(action)) return;

    // 防止主进程的处理中状态尚未推回时，同一行被快速重复触发。
    inFlight.current.add(action);
    setFeedback(undefined);
    try {
      const result = await api.runAction(action);
      applyState(result.state);
      const next = feedbackFor(action, result);
      if (next && latestState.current?.openSequence === current.openSequence) {
        setFeedback({ action, ...next });
      }
    } catch {
      if (latestState.current?.openSequence === current.openSequence) {
        setFeedback({ action, label: '操作失败', message: '操作未完成，请重试。', tone: 'error' });
      }
    } finally {
      inFlight.current.delete(action);
    }
  }

  const row = (
    action: TrayPanelAction,
    label: string,
    options: Pick<PanelRowProps, 'variant' | 'icon' | 'checked' | 'accessibleLabel' | 'unavailableReason'>,
  ) => (
    <PanelRow
      action={action}
      label={label}
      {...options}
      feedback={feedback?.action === action ? feedback : undefined}
      disabled={!state || state.disabled.includes(action)}
      unavailable={!state || (action === 'highlight-notes' && !state.notes.windowOpen)}
      pending={Boolean(state?.pending.includes(action))}
      onClick={() => void run(action)}
      onUnavailable={(reason) => setFeedback({
        action,
        label: reason,
        message: reason,
        tone: 'neutral',
      })}
    />
  );
  const canExplainUnavailable = Boolean(state && !state.notes.windowOpen && !state.pending.includes('toggle-notes'));

  return (
    <main className="tray-panel" aria-label="本地助手托盘面板">
      {row('open-main', '打开主窗口', { variant: 'main', icon: <DesktopOutlined /> })}

      <div className="tray-panel-groups">
        <section className="tray-panel-group" aria-label="便利贴">
          {row('toggle-notes', '便利贴', {
            variant: 'header',
            icon: <FileTextOutlined />,
            accessibleLabel: '显示便利贴',
            checked: state?.notes.windowOpen ?? false,
          })}
          <div className="tray-panel-group-items">
            {row('toggle-notes-mode', '桌面模式', {
              variant: 'option',
              checked: state?.notes.desktopMode ?? false,
            })}
            {row('highlight-notes', '检测范围', {
              variant: 'action',
              icon: <ScanOutlined />,
              unavailableReason: canExplainUnavailable ? '请先显示便利贴' : undefined,
            })}
          </div>
        </section>

        <section className="tray-panel-group" aria-label="桌面日历">
          {row('toggle-calendar', '桌面日历', {
            variant: 'header',
            icon: <CalendarOutlined />,
            accessibleLabel: '显示日历',
            checked: state?.calendar.windowOpen ?? false,
          })}
          <div className="tray-panel-group-items">
            {row('toggle-calendar-theme', '深色主题', {
              variant: 'option',
              checked: state?.calendar.darkTheme ?? false,
            })}
            {row('sync-time', '立即校时', { variant: 'action', icon: <ClockCircleOutlined /> })}
          </div>
        </section>
      </div>

      <footer className="tray-panel-footer">
        {row('quit', '退出本地助手', { variant: 'quit', icon: <LogoutOutlined /> })}
      </footer>
      <span className="tray-panel-sr-only" role="status">{feedback?.message}</span>
    </main>
  );
}
