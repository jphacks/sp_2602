// サーバ側の処理（back-a の所有。ひな型の例で、kit:reset で消える）。外部サービス（AI・DB など）は必ずここ経由で呼び、MOCK=1 なら fixtures に切り替える。
// 失敗は AppError を throw する（形の変換は route.ts がやる）。
import "server-only";
import type { Chunk, Req, Res } from "@contracts/api";
import { fixtures } from "@contracts/fixtures";

export const isMock = () => process.env.MOCK === "1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function analyze(req: Req<"analyze">): Promise<Res<"analyze">> {
  if (isMock()) return fixtures.analyze;
  // TODO(back-a, S2): 本物の判定ロジック。外部サービスの失敗は throw new AppError("upstream_failed")
  return {
    summary: `${req.items.length}件を受け取りました（未実装）`,
    verdicts: req.items.map((i) => ({ itemId: i.id, label: "keep", reason: "未実装" })),
  };
}

export async function analyzeStream(
  req: Req<"analyzeStream">,
  emit: (chunk: Chunk<"analyzeStream">) => void,
  signal: AbortSignal,
): Promise<Res<"analyzeStream">> {
  if (isMock()) {
    for (const c of fixtures.analyzeStream.chunks) {
      if (signal.aborted) break;
      emit(c);
      await wait(Number(process.env.MOCK_STREAM_DELAY_MS ?? 400));
    }
    return fixtures.analyzeStream.res;
  }
  // TODO(back-a): AI の返答を受け取るたびに emit({ text }) し、最後に結果を return する
  emit({ text: `${req.items.length}件を確認しています…` });
  return analyze(req);
}
