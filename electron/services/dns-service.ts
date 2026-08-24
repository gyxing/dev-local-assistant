import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DnsFlushResult } from '../../shared/network-tools-types';
import { ElevationService } from './elevation-service';

const execFileAsync = promisify(execFile);
const DNS_COMMAND_TIMEOUT_MS = 15_000;

interface ExecFileError extends Error {
  code?: string | number;
  killed?: boolean;
}

function combineOutput(stdout?: string, stderr?: string): string | undefined {
  const output = [stdout, stderr].filter(Boolean).join('\n').trim();
  return output || undefined;
}

/** 清理 Windows DNS 客户端解析缓存，并在权限不足时按需提权重试。 */
export class DnsService {
  constructor(private readonly elevationService: ElevationService) {}

  async flush(): Promise<DnsFlushResult> {
    const systemRoot = process.env.SystemRoot || process.env.windir;
    if (!systemRoot) {
      return { success: false, message: '无法识别 Windows 系统目录', usedElevation: false };
    }

    const ipconfigPath = path.join(systemRoot, 'System32', 'ipconfig.exe');
    try {
      const { stdout, stderr } = await execFileAsync(ipconfigPath, ['/flushdns'], {
        timeout: DNS_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      });
      return {
        success: true,
        message: 'DNS 缓存已清理',
        output: combineOutput(stdout, stderr),
        usedElevation: false,
      };
    } catch (error: unknown) {
      const normalizedError: ExecFileError =
        error instanceof Error ? (error as ExecFileError) : new Error('清理 DNS 失败');
      if (normalizedError.killed) {
        return { success: false, message: '清理 DNS 超时', usedElevation: false };
      }
      if (normalizedError.code === 'ENOENT') {
        return { success: false, message: '未找到 ipconfig.exe', usedElevation: false };
      }

      try {
        await this.elevationService.flushDns();
        return { success: true, message: 'DNS 缓存已清理', usedElevation: true };
      } catch (elevationError: unknown) {
        return {
          success: false,
          message: elevationError instanceof Error ? elevationError.message : normalizedError.message,
          usedElevation: true,
        };
      }
    }
  }
}
