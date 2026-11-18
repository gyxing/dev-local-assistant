import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, type BrowserWindow } from 'electron';

const execFileAsync = promisify(execFile);
const BOTTOM_SCRIPT_TIMEOUT_MS = 5000;

/** 将 Windows 窗口移到 Z 序底部。无法置底时抛出错误供调用方恢复。 */
export async function sendWindowToBottom(window: BrowserWindow): Promise<void> {
  const systemRoot = process.env.SystemRoot || process.env.windir;
  if (process.platform !== 'win32' || !systemRoot || window.isDestroyed()) {
    throw new Error('当前窗口无法执行 Windows 置底');
  }

  const handle = window.getNativeWindowHandle();
  const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-layer.ps1')
    : path.join(app.getAppPath(), 'electron', 'resources', 'desktop-layer.ps1');
  // 用户电脑不保证安装 PowerShell 7，沿用 Windows 自带的 5.1。
  const powerShellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await execFileAsync(
    powerShellPath,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-WindowHandle', hwnd.toString()],
    { timeout: BOTTOM_SCRIPT_TIMEOUT_MS, windowsHide: true },
  );
  if (window.isDestroyed()) {
    throw new Error('置底期间窗口已关闭');
  }
}
