// 定期的に取りに行く仕組み（Push 通知は使わない。作り直し前の決定 10/17）。
//   - 画面が出ている（フォーカスがある）間だけ、intervalMs ごと（既定 30 秒）に fn を呼ぶ
//   - 画面を開いた瞬間・アプリが前面に戻った瞬間に1回呼ぶ
//   - 前の呼び出しが終わっていなければ、次は飛ばす（同じ取得を重ねない）
// TODO(未決): 予備の 15 分ごとの取得（画面が出ていないとき）は、OS の制約があるので Kotlin（WorkManager など）側で作る
//   usePolling(() => configCache.refresh(childId).then(setConfig), { intervalMs: 30_000 });
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { singleFlight } from "./single-flight";

export { singleFlight };

export const DEFAULT_POLL_MS = 30_000;

export function usePolling(fn: () => Promise<unknown>, opts: { intervalMs?: number; enabled?: boolean } = {}): void {
  const intervalMs = opts.intervalMs ?? DEFAULT_POLL_MS;
  const enabled = opts.enabled ?? true;
  // 最新の fn を覚えておく（画面が再描画されるたびにタイマーを作り直さないため）
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);
  // 重ならないようにする仕組みは、この画面で1つだけ作る（フォーカスのたびに作り直さない）。
  // なぜ: タブを行き来すると、画面に戻るたびにすぐ1回取りに行く。前に出ていたときの取得がまだ終わっていないのに
  // 新しく作り直すと、同じ API を重ねて呼んでしまうため
  const tick = useRef<(() => Promise<void>) | null>(null);
  if (tick.current == null) tick.current = singleFlight(() => latest.current());
  const run = tick.current;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const tick = run;
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
    }, [enabled, intervalMs, run]),
  );
}
