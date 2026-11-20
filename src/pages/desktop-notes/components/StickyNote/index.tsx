import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { DeleteOutlined, EllipsisOutlined, PushpinOutlined, SettingOutlined } from '@ant-design/icons';
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
  onOpenSettings: (trigger: HTMLButtonElement | null) => void;
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
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuActionRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const note = noteRef.current;
    if (!isMenuOpen || readOnly || !menu || !note) return;

    const positionMenu = () => {
      // 透明窗口会裁掉边缘外的内容，靠近底边时把操作面板向上移。
      const { top } = note.getBoundingClientRect();
      const desired = Math.min(32, window.innerHeight - top - menu.offsetHeight - 6);
      menu.style.setProperty('--note-menu-top', `${Math.max(6 - top, desired)}px`);
    };

    positionMenu();
    firstMenuActionRef.current?.focus();
    window.addEventListener('resize', positionMenu);
    return () => window.removeEventListener('resize', positionMenu);
  }, [isMenuOpen, readOnly]);

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
    if (event.button !== 0 || editing || isMenuOpen) {
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

      {!readOnly && !editing ? (
        <button
          ref={menuTriggerRef}
          className="note-menu-trigger"
          type="button"
          aria-label="贴纸操作"
          aria-expanded={isMenuOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={onToggleMenu}
        >
          <EllipsisOutlined aria-hidden="true" />
        </button>
      ) : null}

      {!readOnly && isMenuOpen ? (
        <div
          ref={menuRef}
          className="note-menu"
          role="group"
          aria-label="贴纸操作"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              closeMenu();
              menuTriggerRef.current?.focus();
            }
          }}
        >
          <button
            ref={firstMenuActionRef}
            type="button"
            onClick={() => {
              onChange({ id: note.id, pinned: !note.pinned });
              closeMenu();
              menuTriggerRef.current?.focus();
            }}
          >
            <PushpinOutlined aria-hidden="true" />
            {note.pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenSettings(menuTriggerRef.current);
              closeMenu();
            }}
          >
            <SettingOutlined aria-hidden="true" />
            显示设置
          </button>
          <button
            type="button"
            className="note-menu__danger"
            onClick={() => {
              onDelete(note.id);
              closeMenu();
            }}
          >
            <DeleteOutlined aria-hidden="true" />
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
