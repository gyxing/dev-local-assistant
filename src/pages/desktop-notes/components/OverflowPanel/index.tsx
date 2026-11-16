import type { DesktopNote } from '../../../../../shared/desktop-notes-types';

interface OverflowPanelProps {
  notes: DesktopNote[];
  maxLines: number;
  onSelect: (note: DesktopNote) => void;
}

/** 收纳超过桌面显示数量的贴纸，点击后回到可见区域。 */
export default function OverflowPanel({ notes, maxLines, onSelect }: OverflowPanelProps) {
  return (
    <aside className="overflow-panel" aria-label="收纳贴纸">
      {notes.map((note) => (
        <button key={note.id} className="overflow-item" type="button" onClick={() => onSelect(note)}>
          <span style={{ WebkitLineClamp: maxLines }}>{note.text}</span>
        </button>
      ))}
    </aside>
  );
}
