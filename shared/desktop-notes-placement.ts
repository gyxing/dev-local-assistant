import type {
  DesktopNotesAnchor,
  DesktopNotesWindowBounds,
  DesktopNotesWorkArea,
} from './desktop-notes-types';

export const NOTES_WINDOW_EDGE_MARGIN = 20;
export const NOTES_WINDOW_NUDGE_STEP = 40;

const ANCHORS: DesktopNotesAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

const ANCHOR_LABELS: Record<DesktopNotesAnchor, string> = {
  'top-left': '左上',
  'top-right': '右上',
  'bottom-left': '左下',
  'bottom-right': '右下',
  center: '居中',
};

export function listNotesWindowAnchors() {
  return ANCHORS.map((anchor) => ({ anchor, label: ANCHOR_LABELS[anchor] }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 按工作区把窗口放到某个直观位置，并留出边缘空隙。 */
export function placeNotesWindow(
  anchor: DesktopNotesAnchor,
  size: Pick<DesktopNotesWindowBounds, 'width' | 'height'>,
  workArea: DesktopNotesWorkArea,
): DesktopNotesWindowBounds {
  const width = clamp(size.width, 320, Math.max(320, workArea.width));
  const height = clamp(size.height, 240, Math.max(240, workArea.height));
  const maxX = workArea.x + Math.max(0, workArea.width - width);
  const maxY = workArea.y + Math.max(0, workArea.height - height);
  const marginX = Math.min(NOTES_WINDOW_EDGE_MARGIN, Math.max(0, workArea.width - width));
  const marginY = Math.min(NOTES_WINDOW_EDGE_MARGIN, Math.max(0, workArea.height - height));

  if (anchor === 'center') {
    return {
      width,
      height,
      x: workArea.x + Math.round((workArea.width - width) / 2),
      y: workArea.y + Math.round((workArea.height - height) / 2),
    };
  }

  const x = anchor.endsWith('right') ? maxX - marginX : workArea.x + marginX;
  const y = anchor.startsWith('bottom') ? maxY - marginY : workArea.y + marginY;

  return { width, height, x, y };
}

/** 在工作区内平移窗口，避免挪出屏幕。 */
export function nudgeNotesWindow(
  bounds: DesktopNotesWindowBounds,
  direction: 'up' | 'down' | 'left' | 'right',
  workArea: DesktopNotesWorkArea,
): DesktopNotesWindowBounds {
  const maxX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);
  const next = { ...bounds };

  if (direction === 'left') {
    next.x -= NOTES_WINDOW_NUDGE_STEP;
  }
  if (direction === 'right') {
    next.x += NOTES_WINDOW_NUDGE_STEP;
  }
  if (direction === 'up') {
    next.y -= NOTES_WINDOW_NUDGE_STEP;
  }
  if (direction === 'down') {
    next.y += NOTES_WINDOW_NUDGE_STEP;
  }

  return {
    ...next,
    x: clamp(next.x, workArea.x, maxX),
    y: clamp(next.y, workArea.y, maxY),
  };
}

export function matchNotesWindowAnchor(
  bounds: DesktopNotesWindowBounds,
  workArea: DesktopNotesWorkArea,
): DesktopNotesAnchor | undefined {
  return ANCHORS.find((anchor) => {
    const placed = placeNotesWindow(anchor, bounds, workArea);
    return Math.abs(placed.x - bounds.x) <= 8 && Math.abs(placed.y - bounds.y) <= 8;
  });
}

/** 把当前窗口位置说成相对屏幕的距离，而不是原始坐标。 */
export function describeNotesWindow(bounds: DesktopNotesWindowBounds, workArea: DesktopNotesWorkArea) {
  const left = Math.max(0, Math.round(bounds.x - workArea.x));
  const top = Math.max(0, Math.round(bounds.y - workArea.y));
  const right = Math.max(0, Math.round(workArea.x + workArea.width - (bounds.x + bounds.width)));
  const bottom = Math.max(0, Math.round(workArea.y + workArea.height - (bounds.y + bounds.height)));
  const anchor = matchNotesWindowAnchor(bounds, workArea);

  if (anchor === 'center') {
    return '屏幕中央';
  }

  if (anchor === 'top-left') {
    return `屏幕左上角，距左 ${left} 像素，距上 ${top} 像素`;
  }
  if (anchor === 'top-right') {
    return `屏幕右上角，距右 ${right} 像素，距上 ${top} 像素`;
  }
  if (anchor === 'bottom-left') {
    return `屏幕左下角，距左 ${left} 像素，距下 ${bottom} 像素`;
  }
  if (anchor === 'bottom-right') {
    return `屏幕右下角，距右 ${right} 像素，距下 ${bottom} 像素`;
  }

  return `距左 ${left} 像素，距右 ${right} 像素，距上 ${top} 像素，距下 ${bottom} 像素`;
}
