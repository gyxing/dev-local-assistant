import type { DesktopNote, DesktopNoteSettings } from '../../../shared/desktop-notes-types';

/** 置顶优先，其余按最近更新时间决定哪些贴纸留在桌面上。 */
export function computeVisibleNotes(
  notes: DesktopNote[],
  settings: Pick<DesktopNoteSettings, 'maxVisibleNotes' | 'showPinnedOnly'>,
) {
  const candidates = settings.showPinnedOnly ? notes.filter((note) => note.pinned) : notes;
  const sorted = [...candidates].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return right.updatedAt - left.updatedAt;
  });

  return {
    visible: sorted.slice(0, settings.maxVisibleNotes),
    hidden: sorted.slice(settings.maxVisibleNotes),
  };
}
