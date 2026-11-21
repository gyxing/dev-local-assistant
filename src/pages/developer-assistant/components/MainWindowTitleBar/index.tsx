import { App, Button, Dropdown } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { MAIN_WINDOW_TITLE_BAR_HEIGHT, type MainWindowMenuGroup } from '../../../../../shared/main-window-appearance';
import './index.less';

const logo = new URL('../../../../../build/icon.png', import.meta.url).href;

/** 标题和菜单共享页面主题，右侧窗口按钮由 Electron 绘制。 */
export default function MainWindowTitleBar() {
  const api = window.mainWindowMenu;
  const { message } = App.useApp();
  const [groups, setGroups] = useState<MainWindowMenuGroup[]>([]);
  const [openIndex, setOpenIndex] = useState<number>();
  const menuTrigger = useRef<HTMLElement>();
  const previousFocus = useRef<HTMLElement>();

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.getGroups().then(
      next => { if (active) setGroups(next); },
      () => { if (active) void message.error('未能读取应用菜单。'); },
    );
    return () => { active = false; };
  }, [api, message]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (openIndex !== undefined && event.key === 'Escape') {
        setOpenIndex(undefined);
        menuTrigger.current?.focus({ preventScroll: true });
        return;
      }
      if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
      const index = groups.findIndex(group => group.label[0]?.toLowerCase() === event.key.toLowerCase());
      if (index < 0) return;
      event.preventDefault();
      if (openIndex === undefined) rememberFocus();
      setOpenIndex(index);
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [groups, openIndex]);

  function rememberFocus() {
    const focused = document.activeElement;
    previousFocus.current = focused instanceof HTMLElement ? focused : undefined;
  }

  async function runCommand(id: number) {
    if (!api) return;
    setOpenIndex(undefined);
    // 编辑命令执行前恢复原输入框焦点，保留用户选中的文本。
    const target = previousFocus.current;
    if (target?.isConnected && target !== document.body) target.focus({ preventScroll: true });
    try {
      await api.runCommand(id);
    } catch {
      void message.error('未能执行菜单命令。');
    }
  }

  if (!api) return null;

  return (
    <header className="main-window-titlebar" style={{ '--titlebar-height': `${MAIN_WINDOW_TITLE_BAR_HEIGHT}px` } as React.CSSProperties}>
      <div className="main-window-titlebar__area">
        <img src={logo} alt="" width={18} height={18} draggable={false} />
        <span className="main-window-titlebar__name">本地助手</span>
        <nav className="main-window-titlebar__menus" aria-label="应用菜单">
          {groups.map(({ label, items }, index) => (
            <Dropdown
              key={label}
              trigger={['click']}
              autoFocus
              open={openIndex === index}
              onOpenChange={open => {
                if (open && openIndex === undefined) rememberFocus();
                if (open || openIndex === index) setOpenIndex(open ? index : undefined);
              }}
              menu={{
                selectable: false,
                items: items.map(item => item.type === 'separator' ? { type: 'divider', key: item.id } : {
                  key: item.id,
                  disabled: !item.enabled,
                  label: (
                    <span className="main-window-titlebar__command">
                      <span>{item.label}</span>
                      {item.accelerator && <kbd>{item.accelerator.replace(/CommandOrControl|CmdOrCtrl|Control/g, 'Ctrl')}</kbd>}
                    </span>
                  ),
                }),
                onClick: ({ key }) => void runCommand(Number(key)),
              }}
            >
              <Button
                ref={node => { if (openIndex === index && node instanceof HTMLElement) menuTrigger.current = node; }}
                size="small"
                type="text"
                aria-haspopup="menu"
                aria-expanded={openIndex === index}
                onMouseDown={event => event.preventDefault()}
              >
                {label}
              </Button>
            </Dropdown>
          ))}
        </nav>
      </div>
    </header>
  );
}
