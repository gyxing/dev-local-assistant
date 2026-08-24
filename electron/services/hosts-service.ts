import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  HostsBackupItem,
  HostsDocument,
  HostsMutationResult,
  HostsSaveRequest,
} from '../../shared/network-tools-types';
import { DnsService } from './dns-service';
import { ElevationService } from './elevation-service';
import { decodeHostsBuffer, encodeHostsText } from './hosts-file-codec';
import { parseHostsText, renderHostsText } from './hosts-file-parser';

const ORIGINAL_BACKUP_NAME = 'hosts.original.bak';
const HISTORY_BACKUP_PATTERN = /^hosts\.\d{8}-\d{6}-\d{3}\.[a-f0-9]{8}\.bak$/;

// 原始备份永不覆盖，历史备份只保留最新 30 份。
const HISTORY_BACKUP_LIMIT = 30;

interface HostsSnapshot {
  buffer: Buffer;
  hash: string;
  lastModifiedAt: number;
}

interface FileSystemError extends Error {
  code?: string;
}

function calculateSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function isPermissionError(error: unknown): boolean {
  return error instanceof Error && ['EACCES', 'EPERM'].includes((error as FileSystemError).code ?? '');
}

function formatBackupTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-',
    pad(date.getMilliseconds(), 3),
  ].join('');
}

/**
 * 管理 Windows Hosts 文件，所有写入都经过原始备份、历史备份、哈希冲突和写后校验。
 */
export class HostsService {
  private readonly hostsPath: string;
  private readonly backupDirectory: string;
  private readonly tempDirectory: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    userDataPath: string,
    private readonly elevationService: ElevationService,
    private readonly dnsService: DnsService,
  ) {
    const systemRoot = process.env.SystemRoot || process.env.windir;
    if (!systemRoot) {
      throw new Error('无法识别 Windows 系统目录');
    }

    this.hostsPath = path.resolve(systemRoot, 'System32', 'drivers', 'etc', 'hosts');
    this.backupDirectory = path.resolve(userDataPath, 'hosts-backups');
    this.tempDirectory = path.resolve(userDataPath, 'hosts-temp');
  }

  async getDocument(): Promise<HostsDocument> {
    const snapshot = await this.readSnapshot();
    const originalBackup = await this.ensureOriginalBackup(snapshot.buffer);
    return this.createDocument(snapshot, originalBackup);
  }

  async listBackups(): Promise<HostsBackupItem[]> {
    await fs.mkdir(this.backupDirectory, { recursive: true });
    const directoryEntries = await fs.readdir(this.backupDirectory, { withFileTypes: true });
    const backups = await Promise.all(
      directoryEntries
        .filter(
          (entry) =>
            entry.isFile() && (entry.name === ORIGINAL_BACKUP_NAME || HISTORY_BACKUP_PATTERN.test(entry.name)),
        )
        .map((entry) => this.createBackupItem(entry.name)),
    );

    return backups.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'original' ? -1 : 1;
      }
      return right.createdAt - left.createdAt;
    });
  }

  async save(request: HostsSaveRequest): Promise<HostsMutationResult> {
    return this.runMutation(async () => {
      const currentSnapshot = await this.readSnapshot();
      this.assertSourceHash(currentSnapshot.hash, request.sourceHash);
      const originalBackup = await this.ensureOriginalBackup(currentSnapshot.buffer);
      const decoded = decodeHostsBuffer(currentSnapshot.buffer);
      const nextText = renderHostsText(parseHostsText(decoded.text), request.entries);
      const nextBuffer = encodeHostsText(nextText, decoded.encoding);
      const nextHash = calculateSha256(nextBuffer);
      let usedElevation = false;

      if (nextHash !== currentSnapshot.hash) {
        await this.createHistoryBackup(currentSnapshot.buffer);
        usedElevation = await this.writeHostsBuffer(nextBuffer, currentSnapshot.hash);
      }

      const savedSnapshot = await this.readSnapshot();
      if (savedSnapshot.hash !== nextHash) {
        throw new Error('Hosts 文件写入后的内容校验失败');
      }

      const dnsResult = await this.dnsService.flush();
      return {
        document: await this.createDocument(savedSnapshot, originalBackup),
        dnsResult,
        usedElevation,
      };
    });
  }

  async restore(backupId: string, sourceHash: string): Promise<HostsMutationResult> {
    return this.runMutation(async () => {
      const currentSnapshot = await this.readSnapshot();
      this.assertSourceHash(currentSnapshot.hash, sourceHash);
      const originalBackup = await this.ensureOriginalBackup(currentSnapshot.buffer);
      const backup = (await this.listBackups()).find((item) => item.id === backupId);
      if (!backup) {
        throw new Error('备份不存在或已经失效');
      }

      const backupPath = this.resolveBackupPath(backup.id);
      const backupBuffer = await fs.readFile(backupPath);
      // 恢复前先验证编码，避免把无法管理的内容写回系统文件。
      decodeHostsBuffer(backupBuffer);
      await this.createHistoryBackup(currentSnapshot.buffer);
      const usedElevation = await this.writeHostsBuffer(backupBuffer, currentSnapshot.hash);
      const restoredSnapshot = await this.readSnapshot();
      if (restoredSnapshot.hash !== calculateSha256(backupBuffer)) {
        throw new Error('Hosts 备份恢复后的内容校验失败');
      }

      const dnsResult = await this.dnsService.flush();
      return {
        document: await this.createDocument(restoredSnapshot, originalBackup),
        dnsResult,
        usedElevation,
      };
    });
  }

  private async createDocument(snapshot: HostsSnapshot, originalBackup: HostsBackupItem): Promise<HostsDocument> {
    const decoded = decodeHostsBuffer(snapshot.buffer);
    const parsed = parseHostsText(decoded.text);
    return {
      hostsPath: this.hostsPath,
      entries: parsed.entries,
      rawContent: decoded.text,
      sourceHash: snapshot.hash,
      lastModifiedAt: snapshot.lastModifiedAt,
      encoding: decoded.encoding,
      canWrite: await this.canWriteHosts(),
      originalBackup,
    };
  }

  private async readSnapshot(retryCount = 0): Promise<HostsSnapshot> {
    const beforeStat = await fs.stat(this.hostsPath);
    const buffer = await fs.readFile(this.hostsPath);
    const afterStat = await fs.stat(this.hostsPath);
    if (
      retryCount === 0 &&
      (beforeStat.mtimeMs !== afterStat.mtimeMs || beforeStat.size !== afterStat.size)
    ) {
      return this.readSnapshot(1);
    }

    return {
      buffer,
      hash: calculateSha256(buffer),
      lastModifiedAt: afterStat.mtimeMs,
    };
  }

  private async canWriteHosts(): Promise<boolean> {
    try {
      await fs.access(this.hostsPath, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureOriginalBackup(buffer: Buffer): Promise<HostsBackupItem> {
    await fs.mkdir(this.backupDirectory, { recursive: true });
    const originalBackupPath = this.resolveBackupPath(ORIGINAL_BACKUP_NAME);
    try {
      await fs.writeFile(originalBackupPath, buffer, { flag: 'wx' });
    } catch (error: unknown) {
      if (!(error instanceof Error) || (error as FileSystemError).code !== 'EEXIST') {
        throw new Error(`创建原始 Hosts 备份失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return this.createBackupItem(ORIGINAL_BACKUP_NAME);
  }

  private async createHistoryBackup(buffer: Buffer): Promise<HostsBackupItem> {
    await fs.mkdir(this.backupDirectory, { recursive: true });
    const backupName = `hosts.${formatBackupTimestamp(new Date())}.${randomUUID().slice(0, 8)}.bak`;
    await fs.writeFile(this.resolveBackupPath(backupName), buffer, { flag: 'wx' });
    const backup = await this.createBackupItem(backupName);
    await this.pruneHistoryBackups();
    return backup;
  }

  private async createBackupItem(backupName: string): Promise<HostsBackupItem> {
    const backupPath = this.resolveBackupPath(backupName);
    const [buffer, stat] = await Promise.all([fs.readFile(backupPath), fs.stat(backupPath)]);
    return {
      id: backupName,
      kind: backupName === ORIGINAL_BACKUP_NAME ? 'original' : 'history',
      createdAt: stat.birthtimeMs || stat.ctimeMs,
      sizeBytes: stat.size,
      sha256: calculateSha256(buffer),
    };
  }

  private async pruneHistoryBackups(): Promise<void> {
    const historyBackups = (await this.listBackups()).filter((item) => item.kind === 'history');
    for (const backup of historyBackups.slice(HISTORY_BACKUP_LIMIT)) {
      await fs.unlink(this.resolveBackupPath(backup.id));
    }
  }

  private resolveBackupPath(backupName: string): string {
    if (
      path.basename(backupName) !== backupName ||
      (backupName !== ORIGINAL_BACKUP_NAME && !HISTORY_BACKUP_PATTERN.test(backupName))
    ) {
      throw new Error('备份标识不合法');
    }

    const backupPath = path.resolve(this.backupDirectory, backupName);
    if (path.dirname(backupPath) !== this.backupDirectory) {
      throw new Error('备份路径超出允许范围');
    }
    return backupPath;
  }

  private assertSourceHash(currentHash: string, expectedHash: string): void {
    if (!expectedHash || currentHash !== expectedHash) {
      throw new Error('Hosts 文件已被其他程序修改，请重新加载后再保存');
    }
  }

  private async writeHostsBuffer(buffer: Buffer, expectedSourceHash: string): Promise<boolean> {
    await fs.mkdir(this.tempDirectory, { recursive: true });
    const temporaryDirectory = await fs.mkdtemp(path.join(this.tempDirectory, 'write-'));
    const payloadPath = path.join(temporaryDirectory, 'hosts.payload');
    const expectedPayloadHash = calculateSha256(buffer);
    await fs.writeFile(payloadPath, buffer, { flag: 'wx' });

    try {
      const latestSnapshot = await this.readSnapshot();
      this.assertSourceHash(latestSnapshot.hash, expectedSourceHash);
      try {
        await fs.copyFile(payloadPath, this.hostsPath);
        return false;
      } catch (error: unknown) {
        if (!isPermissionError(error)) {
          throw error;
        }
      }

      await this.elevationService.writeHosts(
        this.hostsPath,
        payloadPath,
        expectedSourceHash,
        expectedPayloadHash,
      );
      return true;
    } finally {
      await fs.unlink(payloadPath).catch(() => undefined);
      await fs.rmdir(temporaryDirectory).catch(() => undefined);
    }
  }

  private runMutation<T>(action: () => Promise<T>): Promise<T> {
    const mutation = this.mutationQueue.then(action, action);
    this.mutationQueue = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }
}
