import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KillProcessResult, PortUsageItem } from '../../shared/developer-tools-types';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 20_000;
const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
]);

interface ProcessInfo {
  name?: string;
  path?: string;
  commandLine?: string;
}

function getAddressPort(address: string) {
  const normalizedAddress = address.trim();
  const portText = normalizedAddress.slice(normalizedAddress.lastIndexOf(':') + 1);
  const port = Number(portText);

  return Number.isFinite(port) ? port : undefined;
}

function createPortUsageId(item: Omit<PortUsageItem, 'id'>) {
  // TCP 连接需要包含远程端点，否则同一端口的多条连接会产生重复行键。
  return `${item.protocol}-${item.localAddress}-${item.remoteAddress ?? 'none'}-${item.localPort}-${item.pid}-${item.state ?? 'none'}`;
}

function parseNetstatOutput(output: string, filterPorts?: number[]) {
  const targetPorts = filterPorts?.length ? new Set(filterPorts) : undefined;
  const lines = output.split(/\r?\n/);
  const items: Array<Omit<PortUsageItem, 'id' | 'processName' | 'processPath' | 'commandLine'>> = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || !/^(TCP|UDP)\s+/i.test(trimmedLine)) {
      continue;
    }

    const parts = trimmedLine.split(/\s+/);
    const protocol = parts[0]?.toUpperCase();
    const localAddress = parts[1];
    const remoteAddress = parts[2];
    const localPort = getAddressPort(localAddress);

    if (!protocol || !localAddress || !localPort) {
      continue;
    }

    if (targetPorts && !targetPorts.has(localPort)) {
      continue;
    }

    const isTcp = protocol === 'TCP';
    const pidText = isTcp ? parts[4] : parts[3];
    const pid = Number(pidText);
    if (!Number.isFinite(pid)) {
      continue;
    }

    items.push({
      protocol,
      localAddress,
      remoteAddress,
      localPort,
      state: isTcp ? parts[3] : undefined,
      pid,
    });
  }

  return items;
}

function parseTaskListOutput(output: string): ProcessInfo {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);

  if (!line || line.toUpperCase().includes('INFO:')) {
    return {};
  }

  const columns = line
    .split('","')
    .map((item) => item.replace(/^"|"$/g, '').trim());

  return { name: columns[0] };
}

function parsePowerShellProcessOutput(output: string): ProcessInfo {
  if (!output.trim()) {
    return {};
  }

  try {
    const data = JSON.parse(output) as { Name?: string; ExecutablePath?: string; CommandLine?: string };
    return {
      name: data.Name,
      path: data.ExecutablePath,
      commandLine: data.CommandLine,
    };
  } catch {
    return {};
  }
}

export class PortService {
  async listPortUsages(ports?: number[]): Promise<PortUsageItem[]> {
    const args = process.platform === 'win32' ? ['-ano'] : ['-an'];
    const { stdout } = await execFileAsync('netstat', args, {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
    const items = parseNetstatOutput(stdout, ports);
    const processInfoMap = await this.getProcessInfoMap([...new Set(items.map((item) => item.pid))]);

    return items.map((item) => {
      const processInfo = processInfoMap.get(item.pid);
      return {
        ...item,
        id: createPortUsageId(item),
        processName: processInfo?.name,
        processPath: processInfo?.path,
        commandLine: processInfo?.commandLine,
      };
    });
  }

  async killProcess(pid: number): Promise<KillProcessResult> {
    const processInfo = await this.getProcessInfo(pid);
    const processName = processInfo.name?.toLowerCase();

    if (pid <= 4 || pid === process.pid || (processName && PROTECTED_PROCESS_NAMES.has(processName))) {
      return {
        success: false,
        message: '该进程属于系统或当前应用保护范围，已拒绝结束',
      };
    }

    try {
      const command = process.platform === 'win32' ? 'taskkill' : 'kill';
      const args = process.platform === 'win32' ? ['/PID', String(pid), '/F'] : ['-TERM', String(pid)];
      const { stdout, stderr } = await execFileAsync(command, args, {
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      });
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();

      return {
        success: true,
        message: output || `已结束进程 ${pid}`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: error instanceof Error ? error.message : `结束进程 ${pid} 失败`,
      };
    }
  }

  private async getProcessInfoMap(pids: number[]) {
    const entries = await Promise.all(pids.map(async (pid) => [pid, await this.getProcessInfo(pid)] as const));
    return new Map(entries);
  }

  private async getProcessInfo(pid: number): Promise<ProcessInfo> {
    if (process.platform !== 'win32') {
      return {};
    }

    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          // 脚本型运行时需要完整启动命令，才能从 node.exe、java.exe 定位到具体项目。
          `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -First 1 Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress`,
        ],
        { timeout: COMMAND_TIMEOUT_MS, windowsHide: true },
      );
      const processInfo = parsePowerShellProcessOutput(stdout);
      if (processInfo.name || processInfo.path) {
        return processInfo;
      }
    } catch {
      // 部分精简系统可能不可用 CIM，降级到 tasklist 获取进程名。
    }

    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { timeout: COMMAND_TIMEOUT_MS, windowsHide: true },
      );
      return parseTaskListOutput(stdout);
    } catch {
      return {};
    }
  }
}
