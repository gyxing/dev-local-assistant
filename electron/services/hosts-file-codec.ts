import { TextDecoder } from 'node:util';
import type { HostsFileEncoding } from '../../shared/network-tools-types';

export interface DecodedHostsFile {
  text: string;
  encoding: HostsFileEncoding;
}

function swapUtf16Bytes(buffer: Buffer): Buffer {
  if (buffer.length % 2 !== 0) {
    throw new Error('Hosts 文件的 UTF-16 字节长度不正确');
  }

  const swapped = Buffer.allocUnsafe(buffer.length);
  for (let index = 0; index < buffer.length; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }
  return swapped;
}

/**
 * 解码 Hosts 原始字节；未知编码保持只读失败，避免把乱码固化到系统文件。
 */
export function decodeHostsBuffer(buffer: Buffer): DecodedHostsFile {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf8-bom' };
  }

  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }

  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return { text: swapUtf16Bytes(buffer.subarray(2)).toString('utf16le'), encoding: 'utf16be' };
  }

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf8',
    };
  } catch {
    throw new Error('Hosts 文件不是受支持的 UTF-8 或 UTF-16 编码，已阻止编辑以避免乱码');
  }
}

/** 按原始编码重新生成 Hosts 字节。 */
export function encodeHostsText(text: string, encoding: HostsFileEncoding): Buffer {
  if (encoding === 'utf8') {
    return Buffer.from(text, 'utf8');
  }

  if (encoding === 'utf8-bom') {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  }

  const utf16LeBuffer = Buffer.from(text, 'utf16le');
  if (encoding === 'utf16le') {
    return Buffer.concat([Buffer.from([0xff, 0xfe]), utf16LeBuffer]);
  }

  return Buffer.concat([Buffer.from([0xfe, 0xff]), swapUtf16Bytes(utf16LeBuffer)]);
}
