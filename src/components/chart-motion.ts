// 棒グラフの棒を「左から順に」伸ばすときの、棒ごとの待ち時間の決め方（純粋な関数）。
// React Native を import しない（Vitest で Node のまま確かめるため。tests/child/usage-motion.test.ts）。
// 時間の値そのもの（stagger など）は src/lib/motion.ts の motion を BarChart から渡す。

export type StaggerOptions = {
  stagger: number; // 1本ごとのずれ（ミリ秒）
  emphasisGap: number; // 強調する棒（今日）の前に置く「一拍」（ミリ秒）
};

// 棒の位置 × stagger。値のない棒（記録なし・未来の日）も位置は数える
// （途中に記録のない日があっても、あとから記録が届いても、順番とリズムが崩れないように）。
// 強調する棒（今日）は emphasisGap だけ遅らせて、一拍おいてから伸ばす。
// 子02 は今日より後の日に値がないので、今日がいつも最後に伸びる。
export function barDelays(
  bars: readonly { highlight?: boolean }[],
  { stagger, emphasisGap }: StaggerOptions,
): number[] {
  return bars.map((b, i) => i * stagger + (b.highlight ? emphasisGap : 0));
}

// 予定の待ち時間から、もう過ぎた時間を引いた残り（端末の記録が遅れて届いた棒は、待たせずにすぐ伸ばす）
export function remainingDelay(planned: number, elapsed: number): number {
  return Math.max(0, Math.round(planned - Math.max(0, elapsed)));
}
