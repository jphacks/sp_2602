// 画面の部品が「いつ・どう出てくるか」の決め方（Reveal.tsx が使う）。React Native を import しない（Vitest で Node のまま動かすため）。
// 時刻はすべてミリ秒（Date.now() の値）。
//   - 画面を開いてすぐ（window の間）に出たものは、上から順に少しずつずらして（stagger）下からふわっと出す
//   - それより後で出たもの（通信のあとに出る帯など）は、その場で高さを広げて入れる（下のカードがガタッと動かないように）

export type RevealPlan =
  | { mode: "entrance"; delay: number } // 画面を開いたときの順番の出方。delay だけ待ってから動き始める
  | { mode: "expand" }; // 後から出たもの。高さを 0 から広げて入れる

type PlanInput = {
  groupStartedAt: number; // 画面（RevealGroup）が出た時刻
  now: number; // この部品が出た時刻
  index: number; // 画面を開いたときに見えているものの中で、上から何番目か（0 から）
  stagger: number; // 1つごとのずれ
  window: number; // 画面を開いてから、この時間までに出たものは「最初の出方」にする
};

export function planReveal({ groupStartedAt, now, index, stagger, window }: PlanInput): RevealPlan {
  const elapsed = now - groupStartedAt;
  if (elapsed >= window) return { mode: "expand" };
  // 予定の時刻を過ぎて出たもの（データが少し遅れた）は待たせずに動かす
  return { mode: "entrance", delay: Math.max(0, groupStartedAt + Math.max(0, index) * stagger - now) };
}

// 部品が見え始める時刻（visibleAt）から lead だけ後に、中の動き（進捗バーが伸びる・カードが光る）を始めるには、
// 今から何ミリ秒待てばよいか。カードがまだ透けているうちにバーが伸び終わってしまわないようにする。
// visibleAt が分からない（Reveal の外で使われた）ときは待たない
export function leadDelay(visibleAt: number | null, now: number, lead: number): number {
  if (visibleAt == null) return 0;
  return Math.max(0, Math.round(visibleAt + lead - now));
}
