import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ELEVATION_TIMEOUT_MS = 120_000;

interface ElevatedRequest {
  operation: 'write-hosts' | 'flush-dns';
  hostsPath?: string;
  payloadPath?: string;
  expectedSourceHash?: string;
  expectedPayloadHash?: string;
}

interface ExecFileError extends Error {
  code?: string | number;
  killed?: boolean;
  stderr?: string;
}

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeElevationError(error: unknown): Error {
  const normalizedError: ExecFileError =
    error instanceof Error ? (error as ExecFileError) : new Error('管理员操作失败');
  if (normalizedError.killed) {
    return new Error('管理员操作等待超时');
  }

  const exitCode = Number(normalizedError.code);
  if (exitCode === 11) {
    return new Error('Hosts 文件已被其他程序修改，请重新加载后再保存');
  }
  if (exitCode === 12) {
    return new Error('管理员写入后的 Hosts 文件校验失败');
  }
  if (exitCode === 1 || /1223|cancel(?:ed|led)|取消/i.test(`${normalizedError.message}\n${normalizedError.stderr ?? ''}`)) {
    return new Error('已取消管理员授权，Hosts 文件未修改');
  }

  return new Error(`管理员操作失败：${normalizedError.message}`);
}

/**
 * 仅在普通权限不足时调用固定的 Windows 提权脚本，避免整个 Electron 应用长期高权限运行。
 */
export class ElevationService {
  constructor(private readonly helperPath: string) {}

  async writeHosts(
    hostsPath: string,
    payloadPath: string,
    expectedSourceHash: string,
    expectedPayloadHash: string,
  ): Promise<void> {
    await this.runRequest({
      operation: 'write-hosts',
      hostsPath,
      payloadPath,
      expectedSourceHash,
      expectedPayloadHash,
    });
  }

  async flushDns(): Promise<void> {
    await this.runRequest({ operation: 'flush-dns' });
  }

  private async runRequest(request: ElevatedRequest): Promise<void> {
    const requestBase64 = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    const systemRoot = process.env.SystemRoot || process.env.windir;
    if (!systemRoot) {
      throw new Error('无法识别 Windows 系统目录');
    }

    // 目标电脑不保证安装 PowerShell 7，提权辅助程序必须使用 Windows 自带的 5.1。
    const powerShellPath = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const helperPath = escapePowerShellLiteral(this.helperPath);
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `$helperPath = '${helperPath}'`,
      `$requestBase64 = '${requestBase64}'`,
      "$argumentList = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('\"' + $helperPath + '\"'), '-RequestBase64', $requestBase64) -join ' '",
      `$process = Start-Process -FilePath '${escapePowerShellLiteral(powerShellPath)}' -ArgumentList $argumentList -Verb RunAs -Wait -PassThru -WindowStyle Hidden`,
      'exit $process.ExitCode',
    ].join('; ');
    const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');

    try {
      await execFileAsync(powerShellPath, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], {
        timeout: ELEVATION_TIMEOUT_MS,
        windowsHide: true,
      });
    } catch (error: unknown) {
      throw normalizeElevationError(error);
    }
  }
}
