import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import {
  clampDesktopNoteNumber,
  getNextNoteColor,
  normalizeDesktopNoteSettings,
} from '../../../shared/desktop-notes-state';
import type { DesktopNote, DesktopNoteSettings, DesktopNotesState, DesktopNotesWindowState } from '../../../shared/desktop-notes-types';

const SAVE_DELAY_MS = 250;

type UpdateNoteInput = Partial<Omit<DesktopNote, 'id' | 'createdAt'>> & { id: string };

export function useDesktopNotes() {
  const { message } = App.useApp();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<DesktopNotesState>();
  const [desktopModeActive, setDesktopModeActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const stateRef = useRef<DesktopNotesState>();
  const saveTimerRef = useRef<number>();
  const pausedRef = useRef(false);
  const desktopModeRef = useRef(false);
  const dirtyRef = useRef(false);
  const flushHandlers = useRef(new Set<() => void>());

  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const current = stateRef.current;
      if (current && dirtyRef.current && !pausedRef.current && !desktopModeRef.current) {
        void window.desktopNotes?.saveState(current).then(() => {
          if (stateRef.current === current) {
            dirtyRef.current = false;
          }
        }).catch(() => message.error('便利贴保存失败，请重试'));
      }
    }, SAVE_DELAY_MS);
  }, [message]);

  useEffect(() => {
    const api = window.desktopNotes;
    if (!api) {
      setReady(true);
      return;
    }

    let active = true;
    let receivedPush = false;
    const apply = (next: DesktopNotesWindowState) => {
      window.clearTimeout(saveTimerRef.current);
      dirtyRef.current = false;
      desktopModeRef.current = next.desktopModeActive;
      stateRef.current = next.state;
      setDesktopModeActive(next.desktopModeActive);
      setState(next.state);
      setReady(true);
    };
    const stopApply = api.onApplyState((next) => {
      receivedPush = true;
      apply(next);
    });
    void api.loadState().then((loaded) => {
      if (active && !receivedPush) {
        apply(loaded);
      }
    }).catch(() => {
      if (active) void message.error('读取便利贴失败');
    });
    const stopFlush = api.onFlushRequest(() => {
      // 草稿位于贴纸组件内，先同步提交到 ref，避免读到上一轮渲染的状态。
      flushHandlers.current.forEach((commit) => commit());
      pausedRef.current = true;
      setPaused(true);
      window.clearTimeout(saveTimerRef.current);
      return stateRef.current;
    });
    const stopResume = api.onResumeEdits(() => {
      pausedRef.current = false;
      setPaused(false);
      if (dirtyRef.current) {
        scheduleSave();
      }
    });

    return () => {
      active = false;
      stopApply();
      stopFlush();
      stopResume();
      window.clearTimeout(saveTimerRef.current);
    };
  }, [message, scheduleSave]);

  const updateState = useCallback((updater: (current: DesktopNotesState) => DesktopNotesState) => {
    const current = stateRef.current;
    if (current && !pausedRef.current && !desktopModeRef.current) {
      const next = updater(current);
      stateRef.current = next;
      setState(next);
      dirtyRef.current = true;
      scheduleSave();
    }
  }, [scheduleSave]);

  const registerFlushHandler = useCallback((commit: () => void) => {
    flushHandlers.current.add(commit);
    return () => { flushHandlers.current.delete(commit); };
  }, []);

  const addNote = useCallback(() => {
    updateState((current) => {
      const now = Date.now();
      const index = current.notes.length;

      return {
        ...current,
        notes: [
          ...current.notes,
          {
            id: crypto.randomUUID(),
            text: '新的贴纸',
            x: 28 + (index % 4) * 18,
            y: 28 + (index % 5) * 18,
            zIndex: Math.max(0, ...current.notes.map((note) => note.zIndex)) + 1,
            pinned: false,
            color: getNextNoteColor(index),
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    });
  }, [updateState]);

  const updateNote = useCallback(
    (input: UpdateNoteInput) => {
      updateState((current) => ({
        ...current,
        notes: current.notes.map((note) =>
          note.id === input.id
            ? {
                ...note,
                ...input,
                updatedAt: input.updatedAt ?? Date.now(),
              }
            : note,
        ),
      }));
    },
    [updateState],
  );

  const deleteNote = useCallback(
    (id: string) => {
      updateState((current) => ({
        ...current,
        notes: current.notes.filter((note) => note.id !== id),
      }));
    },
    [updateState],
  );

  const bringNoteToFront = useCallback(
    (id: string) => {
      updateState((current) => ({
        ...current,
        notes: current.notes.map((note) =>
          note.id === id
            ? {
                ...note,
                zIndex: Math.max(0, ...current.notes.map((item) => item.zIndex)) + 1,
                updatedAt: Date.now(),
              }
            : note,
        ),
      }));
    },
    [updateState],
  );

  const updateSettings = useCallback(
    (settings: Partial<DesktopNoteSettings>) => {
      updateState((current) => ({
        ...current,
        settings: normalizeDesktopNoteSettings({
          ...current.settings,
          ...settings,
          maxVisibleNotes: clampDesktopNoteNumber(
            settings.maxVisibleNotes ?? current.settings.maxVisibleNotes,
            1,
            20,
          ),
          maxLinesPerNote: clampDesktopNoteNumber(
            settings.maxLinesPerNote ?? current.settings.maxLinesPerNote,
            1,
            20,
          ),
        }),
      }));
    },
    [updateState],
  );

  return {
    ready,
    state,
    desktopModeActive,
    paused,
    registerFlushHandler,
    addNote,
    updateNote,
    deleteNote,
    bringNoteToFront,
    updateSettings,
  };
}
