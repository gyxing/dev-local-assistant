import { PlusOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
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
  const notes = store.state?.notes ?? [];
  const settings = store.state?.settings;
  const groups = useMemo(
    () => (settings ? computeVisibleNotes(notes, settings) : { visible: [], hidden: [] }),
    [notes, settings],
  );

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
        <button className="surface-action" type="button" aria-label="新建贴纸" onClick={store.addNote}>
          <PlusOutlined />
        </button>

        {groups.visible.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            settings={settings}
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

      {groups.hidden.length > 0 ? (
        <OverflowTag
          count={groups.hidden.length}
          active={overflowOpen}
          onClick={() => setOverflowOpen((current) => !current)}
        />
      ) : null}
      {overflowOpen ? (
        <OverflowPanel notes={groups.hidden} maxLines={settings.maxLinesPerNote} onSelect={restoreHiddenNote} />
      ) : null}
      {settingsOpen ? (
        <SettingsPopover
          settings={settings}
          onChange={store.updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
