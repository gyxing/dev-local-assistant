import type { CalendarTimeInfo, CalendarTimeSource } from '../../shared/desktop-calendar-types';

/** 10 分钟校准一次，足够抵消普通系统时钟漂移 */
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

interface TimeProvider {
  source: Exclude<CalendarTimeSource, 'local'>;
  url: string;
  /** 从接口响应里解析出服务端时间戳（毫秒） */
  parse: (payload: unknown) => number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTaobao(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return undefined;
  }

  const timestamp = Number(payload.data.t);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseSuning(payload: unknown) {
  if (!isRecord(payload) || typeof payload.sysTime1 !== 'string') {
    return undefined;
  }

  // 苏宁返回形如 20261117233727 的北京时间，按 UTC+8 换成时间戳，避免受本机时区影响
  const matched = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(payload.sysTime1);
  if (!matched) {
    return undefined;
  }

  return Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4]) - 8,
    Number(matched[5]),
    Number(matched[6]),
  );
}

const TIME_PROVIDERS: TimeProvider[] = [
  { source: 'taobao', url: 'https://acs.m.taobao.com/gw/mtop.common.getTimestamp/', parse: parseTaobao },
  { source: 'suning', url: 'https://quan.suning.com/getSysTime.do', parse: parseSuning },
];

/**
 * 用公开 HTTP 时间接口校准系统时钟：记录服务端与本机的偏移，渲染层按偏移显示。
 * 全部接口失败时保留上一次偏移，首次失败则回退本机时间。
 */
export class TimeService {
  private offsetMs = 0;
  private syncedAt?: number;
  private source: CalendarTimeSource = 'local';
  private syncTimer?: NodeJS.Timeout;
  private syncing?: Promise<void>;

  async start() {
    await this.sync();
    this.syncTimer = setInterval(() => {
      void this.sync();
    }, SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  getInfo(): CalendarTimeInfo {
    return { offsetMs: this.offsetMs, syncedAt: this.syncedAt, source: this.source };
  }

  async sync(): Promise<CalendarTimeInfo> {
    if (!this.syncing) {
      this.syncing = this.fetchOnce().finally(() => {
        this.syncing = undefined;
      });
    }

    await this.syncing;
    return this.getInfo();
  }

  private async fetchOnce() {
    for (const provider of TIME_PROVIDERS) {
      try {
        const startedAt = Date.now();
        const response = await fetch(provider.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          continue;
        }

        const payload: unknown = await response.json();
        const finishedAt = Date.now();
        const serverTime = provider.parse(payload);
        if (serverTime == null) {
          continue;
        }

        // 用请求往返的中点估算服务端时间对应的本机时刻，抵消一半网络延迟
        this.offsetMs = serverTime - Math.round((startedAt + finishedAt) / 2);
        this.syncedAt = finishedAt;
        this.source = provider.source;
        return;
      } catch {
        // 单个源失败时继续尝试下一个
      }
    }
  }
}
