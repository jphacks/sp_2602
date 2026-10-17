// 重ならないように呼ぶ関数を作る（polling.ts の usePolling が使う。React Native を読まないので Node のテストから確かめられる）。
//   const tick = singleFlight(() => call("planGet", { childId }));
//   tick(); tick(); // 2回目は、1回目が終わっていなければ何もしない
// 失敗は外に投げない（失敗の表示は fn の中で行う。ここでは止めずに次の回を待つ）
export function singleFlight(fn: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch {
      // 失敗の表示は fn の中で行う
    } finally {
      running = false;
    }
  };
}
