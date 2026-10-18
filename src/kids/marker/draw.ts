// tmp/animations/rnweb/whiteboard/marker/draw.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// マーカーで描く動きの道具（確認ページ rnweb/themes/parts.tsx の useTween・useDraw・bezier・HandBox の式をそのまま引き継ぐ）。
// 決まり（src/lib/motion.ts と同じ）:
//   - 「動きを減らす」（useReducedMotion）がオンなら、動かさずに最後の形をすぐ出す
//   - 値が分からない（null）ときは動かさない（呼ぶ側が 0 を渡さない）
//   - 取り直しで値が変わったら、今の位置から新しい値へ（時間は長さ × 0.66）
//   - 線の長さ・幅・SVG の属性を動かすので useNativeDriver は使えない（JS で動かす）。動いている間も押せる（pointerEvents は通す）
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { useReducedMotion } from "@/lib/motion";
import { timing } from "../theme/tool";

// 動き方（確認ページの値）
export const ease = {
  // キュッ: さっと引いて、最後に少し止まる（使った割合の線。ThemedHome.tsx の marker）
  stroke: Easing.bezier(0.2, 0.85, 0.25, 1),
  // 印（下線・円・チェック）を引く（parts.tsx の useDraw）
  draw: Easing.bezier(0.45, 0.05, 0.3, 1),
  // 上限に達した帯の下線（ReachedBanner）
  reached: Easing.bezier(0.3, 0.1, 0.3, 1),
  // ちょん（短い線）
  tick: Easing.out(Easing.quad),
} as const;

// 決まった種からの乱数（手描きの揺れを毎回同じにする）
export function rnd(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 文字列から種を作る（同じ文言の枠は、いつも同じ形）
export function seedOf(text: string, base = 0): number {
  let h = 2166136261 ^ base;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

// 手で4辺を引いた枠の線（kids-design-round2.md 2-4 の式。parts.tsx の HandBox と同じ）。
// 上の辺 → 右の辺 → 下の辺 → 左の辺を1本ずつ。角は丸く曲げ、次の辺の頭と少し重ね、少し行き過ぎる
export function handBoxPath(w: number, h: number, radius: number, seed: number, wobble: number): string {
  const r = rnd(seed);
  const j = () => (r() - 0.5) * 2 * wobble;
  const o = () => 0.8 + r() * 1.4; // 角での行き過ぎ（長いと角が欠けて見える）
  const k = radius * 0.55;
  let d = `M ${-o()} ${0.5 + j()} C ${w * 0.3} ${j()}, ${w * 0.7} ${1 + j()}, ${w - radius} ${0.4 + j()} Q ${w - k} ${0.2}, ${w - 0.4} ${radius}`;
  d += ` M ${w + j() * 0.5} ${radius - o()} C ${w - 1 + j()} ${h * 0.35}, ${w + j()} ${h * 0.65}, ${w - 0.5 + j()} ${h - radius} Q ${w - 0.2} ${h - k}, ${w - radius} ${h - 0.4}`;
  d += ` M ${w - radius + o()} ${h + j() * 0.5} C ${w * 0.65} ${h - 1 + j()}, ${w * 0.35} ${h + j()}, ${radius} ${h - 0.5 + j()} Q ${k} ${h - 0.2}, ${0.4} ${h - radius}`;
  d += ` M ${j() * 0.5} ${h - radius + o()} C ${1 + j()} ${h * 0.65}, ${j()} ${h * 0.35}, ${0.5 + j()} ${radius} Q ${0.2} ${k}, ${radius + o()} ${0.4}`;
  return d;
}

export type Pt = [number, number];
// 3次ベジェをつないだ線（M p0 C c1 c2 p1 C …）と、その長さ（各区間を 24 に分けて足す。見積もりだと尾が先に見えてしまう）
export function bezier(start: Pt, segs: [Pt, Pt, Pt][]) {
  let d = `M ${start[0]} ${start[1]}`;
  let len = 0;
  let p0 = start;
  for (const [c1, c2, p1] of segs) {
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p1[0]} ${p1[1]}`;
    let prev = p0;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1];
      len += Math.hypot(x - prev[0], y - prev[1]);
      prev = [x, y];
    }
    p0 = p1;
  }
  return { d, len };
}

// 線を描く動き（strokeDashoffset を「線の長さ＋線の太さ」→ 0）。描き始めるまでは見えない（丸い端の点も出さない）。
// start が true になったら delay 待って duration で引く。動きを減らすなら、すぐ引き終わった形
export function useDraw(len: number, sw: number, start: boolean, delay: number, duration: number, easing = ease.draw) {
  const reduced = useReducedMotion();
  const full = len + sw + 2;
  const v = useRef(new Animated.Value(full)).current;
  useEffect(() => {
    if (!start || len <= 0) {
      v.setValue(full);
      return;
    }
    if (reduced) {
      v.stopAnimation();
      v.setValue(0);
      return;
    }
    v.setValue(full);
    const a = Animated.timing(v, { toValue: 0, delay, duration, easing, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [len, start, reduced]);
  const opacity = v.interpolate({ inputRange: [full - 1, full], outputRange: [1, 0], extrapolate: "clamp" });
  return { offset: v, opacity, dash: `${full} ${full + 40}`, full };
}

// 0 → to へ動く値。to が変わったら今の位置から（時間 × 0.66）。
// 「開いたときの動き」がまだ始まっていない（delay の途中）うちに to が変わったら、開いたときの動きとしてやり直す（parts.tsx の useTween）
export function useTween(
  to: number | null,
  opts: { delay?: number; duration: number; easing?: (t: number) => number },
) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    if (to == null) return; // 分からない間は動かさない
    if (reduced) {
      v.stopAnimation();
      v.setValue(to);
      return;
    }
    const delay = opts.delay ?? 0;
    if (openedAt.current == null) openedAt.current = Date.now();
    const opening = Date.now() - openedAt.current < delay;
    const anim = Animated.timing(v, {
      toValue: to,
      duration: opening ? opts.duration : Math.round(opts.duration * timing.updateRatio),
      delay: opening ? delay - (Date.now() - openedAt.current) : 0,
      easing: opts.easing ?? ease.stroke,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [to, reduced]);
  return v;
}

// 数え上げ（Animated の値を整数にして文字で出す）。値がすぐ決まったときも取りこぼさないよう、つないだ直後に今の値を読む
export function useCount(v: Animated.Value, scale = 1) {
  const read = () => Math.round((v as unknown as { __getValue(): number }).__getValue() / scale);
  const [n, setN] = useState(read);
  useEffect(() => {
    const id = v.addListener(({ value }) => setN(Math.round(value / scale)));
    setN(read());
    return () => v.removeListener(id);
  }, [v, scale]);
  return n;
}

// 大きさを測る（印・枠を描くため）
export function useSize() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }));
  };
  return [size, onLayout] as const;
}
