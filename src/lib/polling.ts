// 定期的に取りに行く仕組み（Push 通知は使わない。作り直し前の決定 10/17）。
//   - 画面が出ている（フォーカスがある）間だけ、intervalMs ごと（既定 30 秒）に fn を呼ぶ
//   - 画面を開いた瞬間・アプリが前面に戻った瞬間に1回呼ぶ
//   - 前の呼び出しが終わっていなければ、次は飛ばす（同じ取得を重ねない）
// TODO(未決): 予備の 15 分ごとの取得（画面が出ていないとき）は、OS の制約があるので Kotlin（WorkManager など）側で作る
//   usePolling(() => configCache.refresh(childId).then(setConfig), { intervalMs: 30_000 });
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

export const DEFAULT_POLL_MS = 30_000;

// 重ならないように呼ぶ関数を作る（画面に依存しないので、ほかでも使える）
export function singleFlight(fn: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch {
      // 失敗の表示は fn の中で行う（ここでは止めずに次の回を待つ）
    } finally {
      running = false;
    }
  };
}

export function usePolling(fn: () => Promise<unknown>, opts: { intervalMs?: number; enabled?: boolean } = {}): void {
  const intervalMs = opts.intervalMs ?? DEFAULT_POLL_MS;
  const enabled = opts.enabled ?? true;
  // 最新の fn を覚えておく（画面が再描画されるたびにタイマーを作り直さないため）
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const tick = singleFlight(() => latest.current());
      void tick();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void tick();
      }, intervalMs);
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void tick();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [enabled, intervalMs]),
  );
}
