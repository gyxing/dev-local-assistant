import { useEffect } from 'react';
import NoteSurface from './components/NoteSurface';
import { useDesktopNotes } from './useDesktopNotes';
import './index.less';

/**
 * 便利贴透明窗口。背景只在这个路由上清空，避免主工具窗口变成透明。
 */
export default function DesktopNotesPage() {
  const store = useDesktopNotes();

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

  return (
    <main className="desktop-notes">
      {store.ready ? <NoteSurface store={store} /> : null}
    </main>
  );
}
