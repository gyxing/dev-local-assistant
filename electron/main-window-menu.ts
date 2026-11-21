import { Menu } from 'electron';
import type { BrowserWindow } from 'electron';
import type { MainWindowMenuGroup } from '../shared/main-window-appearance';

/** 读取 Electron 默认菜单，让前端菜单和原有快捷键共用命令。 */
export function getMainWindowMenu(): MainWindowMenuGroup[] {
  return (Menu.getApplicationMenu()?.items ?? [])
    .filter(group => group.visible && group.submenu)
    .map(group => ({
      label: group.label,
      items: (group.submenu?.items ?? []).filter(item => item.visible && !item.submenu).map(item =>
        item.type === 'separator'
          ? { id: item.commandId, type: 'separator' }
          : { id: item.commandId, type: 'command', label: item.label, accelerator: item.accelerator, enabled: item.enabled },
      ),
    }));
}

/** 只执行当前菜单中可见、启用的命令。 */
export function runMainWindowMenuCommand(window: BrowserWindow, commandId: unknown) {
  if (typeof commandId !== 'number' || !Number.isInteger(commandId)) {
    return;
  }
  const item = Menu.getApplicationMenu()?.items
    .filter(group => group.visible)
    .flatMap(group => group.submenu?.items ?? [])
    .find(entry => entry.commandId === commandId);
  if (item?.visible && item.enabled && !item.submenu && item.type !== 'separator') {
    item.click({}, window, window.webContents);
  }
}
