import { contextBridge, ipcRenderer } from 'electron';
import type { TrayPanelApi, TrayPanelState } from '../shared/tray-panel-types';
import type { IPC_CHANNELS } from './ipc/channels';

// 沙盒 preload 无法加载本地模块，用类型检查保证通道名称与主进程一致。
const channels = {
  trayPanelGetState: 'tray-panel:get-state',
  trayPanelReady: 'tray-panel:ready',
  trayPanelRunAction: 'tray-panel:run-action',
  trayPanelStateChanged: 'tray-panel:state-changed',
} satisfies Pick<
  typeof IPC_CHANNELS,
  | 'trayPanelGetState'
  | 'trayPanelReady'
  | 'trayPanelRunAction'
  | 'trayPanelStateChanged'
>;

const panelApi: TrayPanelApi = {
  getState: () => ipcRenderer.invoke(channels.trayPanelGetState),
  ready: () => ipcRenderer.invoke(channels.trayPanelReady),
  runAction: (action) =>
    ipcRenderer.invoke(channels.trayPanelRunAction, action),
  onStateChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: TrayPanelState,
    ) => callback(state);
    ipcRenderer.on(channels.trayPanelStateChanged, listener);
    return () =>
      ipcRenderer.removeListener(channels.trayPanelStateChanged, listener);
  },
};

contextBridge.exposeInMainWorld('trayPanel', panelApi);
