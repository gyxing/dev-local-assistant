/** 显示器或工作区的矩形范围，单位为 DIP。 */
export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 主进程返回给管理页的显示器信息。 */
export interface DisplayInfo {
  /** String(display.id)，用于持久化 */
  id: string;
  /** 形如「显示器 1（1920×1080，主屏）」 */
  label: string;
  isPrimary: boolean;
  bounds: DisplayRect;
  workArea: DisplayRect;
  scaleFactor: number;
}
