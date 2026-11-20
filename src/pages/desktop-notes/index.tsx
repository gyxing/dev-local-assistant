import { useEffect, useRef, useState } from 'react';
import { App, ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import { DESKTOP_NOTES_HIGHLIGHT_DURATION_MS } from '../../../shared/desktop-notes-state';
import NoteSurface from './components/NoteSurface';
import { useDesktopNotes } from './useDesktopNotes';
import './index.less';

const noteTheme = {
  token: {
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif',
    colorPrimary: '#886129',
    colorText: '#3F3A33',
    colorBgContainer: '#FFFCF4',
    colorBgElevated: '#FFFCF4',
    colorBorder: '#DED1BA',
    borderRadius: 7,
  },
} satisfies ThemeConfig;

/** 为透明便利贴窗口及其设置面板提供独立配色。 */
export default function DesktopNotesPage() {
  return (
    <ConfigProvider theme={noteTheme}>
      <App component={false}><DesktopNotesWindow /></App>
    </ConfigProvider>
  );
}

/**
 * 便利贴透明窗口。背景只在这个路由上清空，避免主工具窗口变成透明。
 */
function DesktopNotesWindow() {
  const store = useDesktopNotes();
  const [highlighting, setHighlighting] = useState(false);
  const [highlightSize, setHighlightSize] = useState('');
  const highlightTimerRef = useRef<number>();

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      html, body, #root, #root > div {
        height: 100%;
        overflow: hidden;
        background: transparent !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    const api = window.desktopNotes;
    if (!api) {
      return;
    }

    // 高亮只在本窗口渲染，用来向用户展示便利贴实际占用的桌面区域
    const trigger = () => {
      setHighlightSize(`${Math.round(window.innerWidth)} × ${Math.round(window.innerHeight)}`);
      setHighlighting(true);
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlighting(false);
      }, DESKTOP_NOTES_HIGHLIGHT_DURATION_MS);
    };

    const stop = api.onBoundsHighlight(trigger);
    // 窗口刚创建时高亮事件可能早于监听注册，挂载后主动领取一次
    void api.takeBoundsHighlight().then((pending) => {
      if (pending) {
        trigger();
      }
    });

    return () => {
      stop();
      window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  return (
    <main className="desktop-notes">
      {store.ready ? <NoteSurface store={store} /> : null}
      {highlighting ? (
        <div className="desktop-notes__highlight" aria-hidden>
          <span className="desktop-notes__highlight-size">{highlightSize}</span>
        </div>
      ) : null}
    </main>
  );
}
