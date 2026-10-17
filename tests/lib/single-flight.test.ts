// 重ならないように呼ぶ仕組み（src/lib/single-flight.ts。usePolling が画面ごとに1つだけ作って使う）。
// タブを行き来すると画面に戻るたびにすぐ1回取りに行くので、前の取得が終わる前に同じ API を重ねて呼ばないことを確かめる。
import { describe, expect, it } from "vitest";
import { singleFlight } from "@/lib/single-flight";

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("前の呼び出しが終わるまでは、次を呼ばない（タブを戻ったときの取得を重ねない）", async () => {
    let calls = 0;
    const d = deferred();
    const tick = singleFlight(() => {
      calls++;
      return d.promise;
    });
    const first = tick();
    await tick(); // 1回目がまだ終わっていない → すぐ戻る
    await tick();
    expect(calls).toBe(1);
    d.resolve();
    await first;
    await tick();
    expect(calls).toBe(2);
  });

  it("失敗しても止まらず、次の回はまた呼ぶ（失敗の表示は呼ぶ側が出す）", async () => {
    let calls = 0;
    const tick = singleFlight(async () => {
      calls++;
      throw new Error("通信できない");
    });
    await expect(tick()).resolves.toBeUndefined();
    await tick();
    expect(calls).toBe(2);
  });
});
