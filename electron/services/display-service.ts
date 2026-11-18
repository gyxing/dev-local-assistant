import { screen } from 'electron';
import type { DisplayInfo, DisplayRect } from '../../shared/display-types';

function toRect(rect: Electron.Rectangle): DisplayRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** 按屏幕排列顺序给显示器编号，主屏优先在前面的位置不变。 */
function sortDisplays(displays: Electron.Display[]) {
  return [...displays].sort((left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y);
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = String(screen.getPrimaryDisplay().id);

  return sortDisplays(screen.getAllDisplays()).map((display, index) => {
    const id = String(display.id);
    const isPrimary = id === primaryId;

    return {
      id,
      label: `显示器 ${index + 1}（${display.bounds.width}×${display.bounds.height}${isPrimary ? '，主屏' : ''}）`,
      isPrimary,
      bounds: toRect(display.bounds),
      workArea: toRect(display.workArea),
      scaleFactor: display.scaleFactor,
    };
  });
}

/** 按保存的 id 找显示器，找不到时回退主屏。 */
export function getDisplayInfo(displayId?: string): DisplayInfo {
  const displays = listDisplays();
  const matched = displayId ? displays.find((display) => display.id === displayId) : undefined;

  return matched ?? displays.find((display) => display.isPrimary) ?? displays[0];
}

export function getDisplayWorkArea(displayId?: string): DisplayRect {
  return getDisplayInfo(displayId).workArea;
}

export function isDisplayAvailable(displayId?: string): boolean {
  if (!displayId) {
    return true;
  }

  return screen.getAllDisplays().some((display) => String(display.id) === displayId);
}

export function getPrimaryDisplayId(): string {
  return String(screen.getPrimaryDisplay().id);
}
