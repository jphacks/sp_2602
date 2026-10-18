// 子02 使用割合の「出る順番」の決まり（純粋な関数。React Native を import しない。tests/child/usage-motion.test.ts）。
// 流れ: 円形ゲージが伸びる → 伸び終わるころにペースの札が「ぽん」と出る → 週の棒グラフが左から順に伸び、今日が一拍おいて最後。
// 全体で 1.5 秒前後に収める（日曜でも 1.6 秒以内。長いと子どもが待たされる）。
// 時間は値が分かった時点から数える（画面を開いた時点ではない。読み込み中に時間が過ぎて動きが飛ばないように）。
// 値が分からないもの（「--」・棒なし）は、この流れに入れず動かさない（MVP_SPEC 5.3・AC-09）。

// src/lib/motion.ts の motion.duration と motion.stagger（テストでは同じ値を直接渡す）
export type MotionDurations = { short: number; medium: number; fill: number; stagger: number };

export type UsageTimeline = {
  gauge: number; // 弧が伸び始めるまで（中央の数字も同時に数え始める）
  chip: number; // ペースの札が出始めるまで
  bars: number; // ゲージがあるとき、1本目の棒が伸び始めるまで
  barsAlone: number; // ゲージがないとき（上限未設定・取得不可などの文を出しているとき）の 1本目
};

// 弧の動き（motion.easing.enter）は前のめりで、全体の 6 割の時間で 9 割以上まで伸びる。札はそこで出す
const CHIP_AT = 0.6;

export function usageTimeline(d: MotionDurations): UsageTimeline {
  // 画面を作る処理と重なると最初の数コマが飛び、前のめりの動きでは弧が跳んで見えるので、ほんの少し待つ
  const gauge = d.short / 2;
  const chip = gauge + Math.round(d.fill * CHIP_AT);
  // 札が出始めて形になったころに棒を始める（札と棒が同時に動くと目が散る）
  const bars = chip + d.stagger * 2;
  // ゲージがないときは待つ相手がいないので、すぐ始める
  return { gauge, chip, bars, barsAlone: d.short };
}
