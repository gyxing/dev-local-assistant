import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { DesktopNote, DesktopNoteSettings } from '../../../../../shared/desktop-notes-types';

type UpdateNoteInput = Partial<Omit<DesktopNote, 'id' | 'createdAt'>> & { id: string };

interface StickyNoteProps {
  note: DesktopNote;
  settings: DesktopNoteSettings;
  readOnly: boolean;
  registerFlushHandler: (commit: () => void) => () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onChange: (input: UpdateNoteInput) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  noteX: number;
  noteY: number;
  maxX: number;
  maxY: number;
  latestX: number;
  latestY: number;
}

/**
 * 单张桌面贴纸。双击编辑，拖拽改位置，右键打开置顶和删除。
 */
export default function StickyNote({
  note,
  settings,
  readOnly,
  registerFlushHandler,
  isMenuOpen,
  onToggleMenu,
  onChange,
  onDelete,
  onOpenSettings,
}: StickyNoteProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [dragState, setDragState] = useState<DragState>();
  const noteRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && !readOnly) {
      textareaRef.current?.focus();
    }
  }, [editing, readOnly]);

  useEffect(() => {
    if (!editing) {
      setDraft(note.text);
    }
  }, [editing, note.text]);

  function saveDraft() {
    setEditing(false);
    const text = (textareaRef.current?.value ?? draft).trim() || '空白贴纸';
    if (text !== note.text) {
      onChange({ id: note.id, text });
    }
  }

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (editing || isMenuOpen) {
      return;
    }

    const noteElement = noteRef.current;
    const surfaceElement = noteElement?.parentElement;
    if (!noteElement || !surfaceElement) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      noteX: note.x,
      noteY: note.y,
      maxX: Math.max(0, surfaceElement.clientWidth - noteElement.offsetWidth),
      maxY: Math.max(0, surfaceElement.clientHeight - noteElement.offsetHeight),
      latestX: note.x,
      latestY: note.y,
    });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState) {
      return;
    }

    const nextX = clampNumber(dragState.noteX + event.clientX - dragState.startX, 0, dragState.maxX);
    const nextY = clampNumber(dragState.noteY + event.clientY - dragState.startY, 0, dragState.maxY);
    setDragState({ ...dragState, latestX: nextX, latestY: nextY });
    onChange({ id: note.id, x: nextX, y: nextY, updatedAt: note.updatedAt });
  }

  function endDrag() {
    if (dragState && (dragState.latestX !== dragState.noteX || dragState.latestY !== dragState.noteY)) {
      onChange({ id: note.id, x: dragState.latestX, y: dragState.latestY });
    }

    if (dragState && noteRef.current?.hasPointerCapture(dragState.pointerId)) {
      noteRef.current.releasePointerCapture(dragState.pointerId);
    }
    setDragState(undefined);
  }

  function closeMenu() {
    if (isMenuOpen) {
      onToggleMenu();
    }
  }

  useLayoutEffect(() => registerFlushHandler(() => {
    if (editing) saveDraft();
    if (dragState) endDrag();
    closeMenu();
  }));

  return (
    <article
      ref={noteRef}
      className={`sticky-note${note.pinned ? ' is-pinned' : ''}`}
      style={{
        left: note.x,
        top: note.y,
        zIndex: note.zIndex,
        backgroundColor: note.color,
        opacity: settings.opacity,
        fontSize: settings.fontSize,
      }}
      onDoubleClick={readOnly ? undefined : () => {
        closeMenu();
        setEditing(true);
      }}
      onContextMenu={readOnly ? undefined : (event) => {
        event.preventDefault();
        onToggleMenu();
      }}
      onPointerDown={readOnly ? undefined : startDrag}
      onPointerMove={readOnly ? undefined : moveDrag}
      onPointerUp={readOnly ? undefined : endDrag}
      onPointerCancel={readOnly ? undefined : endDrag}
    >
      {editing && !readOnly ? (
        <textarea
          ref={textareaRef}
          className="note-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveDraft}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(note.text);
              setEditing(false);
            }

            if (event.key === 'Enter' && event.ctrlKey) {
              saveDraft();
            }
          }}
        />
      ) : (
        <p className="note-text" style={{ WebkitLineClamp: settings.maxLinesPerNote }}>
          {note.text}
        </p>
      )}

      {!readOnly && isMenuOpen ? (
        <div className="note-menu" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              onChange({ id: note.id, pinned: !note.pinned });
              closeMenu();
            }}
          >
            {note.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              closeMenu();
            }}
          >
            显示设置
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(note.id);
              closeMenu();
            }}
          >
            删除
          </button>
        </div>
      ) : null}
    </article>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
