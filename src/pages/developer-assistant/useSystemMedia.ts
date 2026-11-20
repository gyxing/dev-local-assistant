import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** 读取系统外观或窗口断点，收起到托盘后恢复焦点时重新检查。 */
export default function useSystemMedia(query: string) {
  const media = useMemo(() => window.matchMedia(query), [query]);

  const subscribe = useCallback((update: () => void) => {
    media.addEventListener('change', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [media]);

  const snapshot = useCallback(() => media.matches, [media]);
  return useSyncExternalStore(subscribe, snapshot);
}
