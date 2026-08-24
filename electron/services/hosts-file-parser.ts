import { isIP } from 'node:net';
import type { HostsEntry } from '../../shared/network-tools-types';

// 只识别工具约定的上方说明与停用标记，其他注释保持原样。
const DESCRIPTION_PATTERN = /^\s*#\s*说明[：:]\s*(.*?)\s*$/;
const DISABLED_ENTRY_PATTERN = /^\s*#\s*\[已停用\]\s*(.*?)\s*$/;

// 限制渲染端提交规模，避免异常输入放大为系统文件写入。
const MAX_ENTRY_COUNT = 5_000;
const MAX_COMMENT_LENGTH = 200;

interface ParsedMapping {
  address: string;
  hostnames: string[];
  inlineComment?: string;
}

interface HostsEntryLocation {
  entry: HostsEntry;
  lineIndex: number;
  descriptionLineIndex?: number;
  hasInlineComment: boolean;
  rawMappingLine: string;
  rawDescriptionLine?: string;
}

export interface ParsedHostsText {
  lines: string[];
  lineEnding: string;
  endsWithNewline: boolean;
  entries: HostsEntry[];
  locations: HostsEntryLocation[];
}

function splitInlineComment(rawLine: string): { mappingText: string; inlineComment?: string } {
  const commentIndex = rawLine.indexOf('#');
  if (commentIndex < 0) {
    return { mappingText: rawLine.trim() };
  }

  const inlineComment = rawLine.slice(commentIndex + 1).trim();
  return {
    mappingText: rawLine.slice(0, commentIndex).trim(),
    inlineComment: inlineComment || undefined,
  };
}

function parseMapping(rawLine: string): ParsedMapping | undefined {
  const { mappingText, inlineComment } = splitInlineComment(rawLine);
  const [address, ...hostnames] = mappingText.split(/\s+/).filter(Boolean);
  if (!address || isIP(address) === 0 || hostnames.length === 0) {
    return undefined;
  }

  return { address, hostnames, inlineComment };
}

function parseEntryLine(rawLine: string): { mapping: ParsedMapping; enabled: boolean } | undefined {
  const disabledMatch = rawLine.match(DISABLED_ENTRY_PATTERN);
  if (disabledMatch) {
    const mapping = parseMapping(disabledMatch[1]);
    return mapping ? { mapping, enabled: false } : undefined;
  }

  const mapping = parseMapping(rawLine);
  return mapping ? { mapping, enabled: true } : undefined;
}

function joinComments(description?: string, inlineComment?: string): string | undefined {
  const comments = [description, inlineComment].map((item) => item?.trim()).filter(Boolean);
  return comments.length > 0 ? comments.join('；') : undefined;
}

function createEntryId(lineIndex: number): string {
  return `line-${lineIndex + 1}`;
}

function detectLineEnding(text: string): string {
  if (text.includes('\r\n')) {
    return '\r\n';
  }

  if (text.includes('\n')) {
    return '\n';
  }

  if (text.includes('\r')) {
    return '\r';
  }

  return process.platform === 'win32' ? '\r\n' : '\n';
}

/**
 * 解析 Hosts 文本，只把有效映射和本工具明确标记的停用映射暴露给界面。
 */
export function parseHostsText(text: string): ParsedHostsText {
  const lineEnding = detectLineEnding(text);
  const endsWithNewline = /(?:\r\n|\n|\r)$/.test(text);
  const lines = text.split(/\r\n|\n|\r/);
  if (endsWithNewline) {
    lines.pop();
  }

  const entries: HostsEntry[] = [];
  const locations: HostsEntryLocation[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const parsedLine = parseEntryLine(rawLine);
    if (!parsedLine) {
      return;
    }

    const previousLine = lines[lineIndex - 1];
    const descriptionMatch = previousLine?.match(DESCRIPTION_PATTERN);
    const description = descriptionMatch?.[1]?.trim() || undefined;
    const entry: HostsEntry = {
      id: createEntryId(lineIndex),
      address: parsedLine.mapping.address,
      hostnames: parsedLine.mapping.hostnames,
      comment: joinComments(description, parsedLine.mapping.inlineComment),
      enabled: parsedLine.enabled,
    };

    entries.push(entry);
    locations.push({
      entry,
      lineIndex,
      descriptionLineIndex: descriptionMatch ? lineIndex - 1 : undefined,
      hasInlineComment: Boolean(parsedLine.mapping.inlineComment),
      rawMappingLine: rawLine,
      rawDescriptionLine: descriptionMatch ? previousLine : undefined,
    });
  });

  return { lines, lineEnding, endsWithNewline, entries, locations };
}

function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > 253 ||
    normalized.startsWith('.') ||
    normalized.endsWith('.') ||
    normalized.includes('..') ||
    /[\s#*\u0000-\u001f\u007f]/.test(normalized) ||
    !/^[a-z0-9._-]+$/i.test(normalized) ||
    normalized.split('.').some((label) => label.length === 0 || label.length > 63)
  ) {
    throw new Error(`主机名格式不正确：${hostname}`);
  }

  return normalized;
}

function normalizeComment(comment?: string): string | undefined {
  const normalized = comment?.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > MAX_COMMENT_LENGTH || /[\r\n\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`注释必须为 ${MAX_COMMENT_LENGTH} 个字符以内的单行文本`);
  }

  return normalized.replace(/^#+\s*/, '');
}

/**
 * 校验并归一化渲染进程提交的 Hosts 记录，避免重复映射和控制字符进入系统文件。
 */
export function validateHostsEntries(entries: HostsEntry[]): HostsEntry[] {
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new Error(`Hosts 记录不能超过 ${MAX_ENTRY_COUNT} 条`);
  }

  const entryIds = new Set<string>();
  const enabledHostnames = new Map<string, string>();

  return entries.map((entry) => {
    const id = entry.id.trim();
    if (!id || entryIds.has(id)) {
      throw new Error('Hosts 记录标识重复或为空');
    }
    entryIds.add(id);

    const address = entry.address.trim();
    if (isIP(address) === 0) {
      throw new Error(`IP 地址格式不正确：${entry.address}`);
    }

    const hostnames = Array.from(new Set(entry.hostnames.map(normalizeHostname)));
    if (hostnames.length === 0) {
      throw new Error('每条 Hosts 记录至少需要一个主机名');
    }

    if (entry.enabled) {
      for (const hostname of hostnames) {
        const existingAddress = enabledHostnames.get(hostname);
        if (existingAddress) {
          throw new Error(`主机名重复：${hostname} 已映射到 ${existingAddress}`);
        }
        enabledHostnames.set(hostname, address);
      }
    }

    return {
      id,
      address,
      hostnames,
      comment: normalizeComment(entry.comment),
      enabled: Boolean(entry.enabled),
    };
  });
}

function entriesEqual(left: HostsEntry, right: HostsEntry): boolean {
  return (
    left.address === right.address &&
    left.enabled === right.enabled &&
    left.comment === right.comment &&
    left.hostnames.length === right.hostnames.length &&
    left.hostnames.every((hostname, index) => hostname === right.hostnames[index])
  );
}

function renderEntry(entry: HostsEntry): string[] {
  const mapping = `${entry.address} ${entry.hostnames.join(' ')}`;
  const lines = entry.comment ? [`# 说明：${entry.comment}`] : [];
  lines.push(entry.enabled ? mapping : `# [已停用] ${mapping}`);
  return lines;
}

/**
 * 将结构化记录写回 Hosts 文本；未改动的原始行保持不变，行尾注释在首次保存时迁移到上方。
 */
export function renderHostsText(parsed: ParsedHostsText, requestedEntries: HostsEntry[]): string {
  const entries = validateHostsEntries(requestedEntries);
  const requestedEntryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const locationMap = new Map(parsed.locations.map((location) => [location.lineIndex, location]));
  const descriptionLineIndexes = new Set(
    parsed.locations
      .map((location) => location.descriptionLineIndex)
      .filter((lineIndex): lineIndex is number => lineIndex !== undefined),
  );
  const outputLines: string[] = [];

  parsed.lines.forEach((rawLine, lineIndex) => {
    if (descriptionLineIndexes.has(lineIndex)) {
      return;
    }

    const location = locationMap.get(lineIndex);
    if (!location) {
      outputLines.push(rawLine);
      return;
    }

    const requestedEntry = requestedEntryMap.get(location.entry.id);
    if (!requestedEntry) {
      return;
    }

    requestedEntryMap.delete(location.entry.id);
    if (!location.hasInlineComment && entriesEqual(location.entry, requestedEntry)) {
      if (location.rawDescriptionLine) {
        outputLines.push(location.rawDescriptionLine);
      }
      outputLines.push(location.rawMappingLine);
      return;
    }

    outputLines.push(...renderEntry(requestedEntry));
  });

  const newEntries = entries.filter((entry) => requestedEntryMap.has(entry.id));
  if (newEntries.length > 0 && outputLines.some((line) => line.trim()) && outputLines.at(-1)?.trim()) {
    outputLines.push('');
  }

  newEntries.forEach((entry, index) => {
    outputLines.push(...renderEntry(entry));
    if (index < newEntries.length - 1) {
      outputLines.push('');
    }
  });

  const output = outputLines.join(parsed.lineEnding);
  return parsed.endsWithNewline || newEntries.length > 0 ? `${output}${parsed.lineEnding}` : output;
}
