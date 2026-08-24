export type HostsFileEncoding = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be';

export interface HostsEntry {
  id: string;
  address: string;
  hostnames: string[];
  comment?: string;
  enabled: boolean;
}

export type HostsBackupKind = 'original' | 'history';

export interface HostsBackupItem {
  id: string;
  kind: HostsBackupKind;
  createdAt: number;
  sizeBytes: number;
  sha256: string;
}

export interface HostsDocument {
  hostsPath: string;
  entries: HostsEntry[];
  rawContent: string;
  sourceHash: string;
  lastModifiedAt: number;
  encoding: HostsFileEncoding;
  canWrite: boolean;
  originalBackup?: HostsBackupItem;
}

export interface HostsSaveRequest {
  sourceHash: string;
  entries: HostsEntry[];
}

export interface DnsFlushResult {
  success: boolean;
  message: string;
  output?: string;
  usedElevation: boolean;
}

export interface HostsMutationResult {
  document: HostsDocument;
  dnsResult: DnsFlushResult;
  usedElevation: boolean;
}
