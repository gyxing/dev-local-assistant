import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampDesktopNoteNumber,
  getNextNoteColor,
  normalizeDesktopNoteSettings,
} from '../../../shared/desktop-notes-state';
import type { DesktopNote, DesktopNoteSettings, DesktopNotesState } from '../../../shared/desktop-notes-types';

const SAVE_DELAY_MS = 250;

type UpdateNoteInput = Partial<Omit<DesktopNote, 'id' | 'createdAt'>> & { id: string };

export function useDesktopNotes() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<DesktopNotesState>();
  const stateRef = useRef<DesktopNotesState>();
  const saveTimerRef = useRef<number>();
  const loadedRef = useRef(false);
  stateRef.current = state;

  useEffect(() => {
    const api = window.desktopNotes;
    if (!api) {
      setReady(true);
      return;
    }

    let active = true;
    void api.loadState().then((loadedState) => {
      if (!active) {
        return;
      }

      loadedRef.current = true;
      setState(loadedState);
      setReady(true);
    });

    const stopApply = api.onApplyState((nextState) => {
      loadedRef.current = true;
      setState(nextState);
      setReady(true);
    });
    const stopFlush = api.onFlushRequest(() => {
      window.clearTimeout(saveTimerRef.current);
      return stateRef.current;
    });

    return () => {
      active = false;
      stopApply();
      stopFlush();
      window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !state || !window.desktopNotes) {
      return;
    }

    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void window.desktopNotes?.saveState(state);
    }, SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const updateState = useCallback((updater: (current: DesktopNotesState) => DesktopNotesState) => {
    setState((current) => (current ? updater(current) : current));
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
    addNote,
    updateNote,
    deleteNote,
    bringNoteToFront,
    updateSettings,
  };
}
