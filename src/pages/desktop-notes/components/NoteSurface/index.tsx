import { DesktopOutlined, PlusOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { DesktopNote } from '../../../../../shared/desktop-notes-types';
import { computeVisibleNotes } from '../../visible-notes';
import type { useDesktopNotes } from '../../useDesktopNotes';
import OverflowPanel from '../OverflowPanel';
import OverflowTag from '../OverflowTag';
import SettingsPopover from '../SettingsPopover';
import StickyNote from '../StickyNote';

interface NoteSurfaceProps {
  store: ReturnType<typeof useDesktopNotes>;
}

/** 把可见贴纸、收纳入口和显示设置放在同一个透明窗口里。 */
export default function NoteSurface({ store }: NoteSurfaceProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeMenuNoteId, setActiveMenuNoteId] = useState<string>();
  const [switchingMode, setSwitchingMode] = useState(false);
  const readOnly = store.desktopModeActive || store.paused;
  const notes = store.state?.notes ?? [];
  const settings = store.state?.settings;
  const groups = useMemo(
    () => (settings ? computeVisibleNotes(notes, settings) : { visible: [], hidden: [] }),
    [notes, settings],
  );

  useEffect(() => {
    if (store.desktopModeActive) {
      setOverflowOpen(false);
      setSettingsOpen(false);
      setActiveMenuNoteId(undefined);
    }
  }, [store.desktopModeActive]);

  async function enterDesktopMode() {
    if (!window.desktopNotes) return;
    setSwitchingMode(true);
    try {
      await window.desktopNotes.setDesktopMode(true);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '切换桌面模式失败');
    } finally {
      setSwitchingMode(false);
    }
  }

  function restoreHiddenNote(note: DesktopNote) {
    store.bringNoteToFront(note.id);
    setOverflowOpen(false);
  }

  if (!settings) {
    return null;
  }

  return (
    <>
      <section className="note-surface" aria-label="桌面贴纸">
        {!store.desktopModeActive ? (
          <div className={`surface-actions${notes.length === 0 ? ' is-compact' : ''}`}>
            <button className="surface-action" type="button" aria-label="新建贴纸" disabled={readOnly} onClick={store.addNote}>
              <PlusOutlined />
            </button>
            <button
              className="surface-action"
              type="button"
              title="切换到桌面模式"
              aria-label="切换到桌面模式"
              disabled={readOnly || switchingMode}
              onClick={() => void enterDesktopMode()}
            >
              <DesktopOutlined />
            </button>
          </div>
        ) : null}

        {groups.visible.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            settings={settings}
            readOnly={readOnly}
            registerFlushHandler={store.registerFlushHandler}
            isMenuOpen={activeMenuNoteId === note.id}
            onToggleMenu={() => setActiveMenuNoteId(activeMenuNoteId === note.id ? undefined : note.id)}
            onChange={store.updateNote}
            onDelete={store.deleteNote}
            onOpenSettings={() => {
              setActiveMenuNoteId(undefined);
              setSettingsOpen(true);
            }}
          />
        ))}
      </section>

      {!readOnly && groups.hidden.length > 0 ? (
        <OverflowTag
          count={groups.hidden.length}
          active={overflowOpen}
          onClick={() => setOverflowOpen((current) => !current)}
        />
      ) : null}
      {!readOnly && overflowOpen ? (
        <OverflowPanel notes={groups.hidden} maxLines={settings.maxLinesPerNote} onSelect={restoreHiddenNote} />
      ) : null}
      {!readOnly && settingsOpen ? (
        <SettingsPopover
          settings={settings}
          onChange={store.updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
