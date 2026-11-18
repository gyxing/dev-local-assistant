/** 面板只能执行这些固定操作，具体行为和启用条件由主进程决定。 */
export const TRAY_PANEL_ACTIONS = [
  'open-main',
  'toggle-notes',
  'toggle-notes-mode',
  'highlight-notes',
  'toggle-calendar',
  'toggle-calendar-theme',
  'sync-time',
  'quit',
] as const;

export type TrayPanelAction = (typeof TRAY_PANEL_ACTIONS)[number];

export interface TrayPanelState {
  revision: number;
  openSequence: number;
  notes: { windowOpen: boolean; desktopMode: boolean };
  calendar: { windowOpen: boolean; darkTheme: boolean };
  pending: TrayPanelAction[];
  disabled: TrayPanelAction[];
}

export interface TrayPanelResult {
  state: TrayPanelState;
  ok: boolean;
  message?: string;
}

export interface TrayPanelApi {
  getState: () => Promise<TrayPanelState>;
  ready: () => Promise<TrayPanelState>;
  runAction: (action: TrayPanelAction) => Promise<TrayPanelResult>;
  onStateChanged: (listener: (state: TrayPanelState) => void) => () => void;
}
