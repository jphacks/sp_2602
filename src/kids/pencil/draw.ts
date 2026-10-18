// tmp/animations/rnweb/whiteboard/pencil/draw.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 鉛筆と蛍光ペンで描く形と動きの道具。決まり（動きを減らす・値が分からないときは動かさない・今の位置から）は marker/draw.ts と同じなので、
// 線を引く動き（useDraw）・ベジェ（bezier）・乱数（rnd）・大きさを測る（useSize）・手で4辺を引いた式（handBoxPath）はそちらを使う。
// ここには鉛筆だけの形（4辺を別々の線に分ける・一筆のカプセル・手で書いた丸）と、動き方（鉛筆で書く・蛍光ペンを一息）を置く。
// なぜその形か・その速さかは EXPRESSION.md。
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { useReducedMotion } from "@/lib/motion";
import { handBoxPath, rnd } from "../marker/draw";

export { bezier, rnd, useDraw, useSize } from "../marker/draw";

// 動き方
export const pencilEase = {
  // 鉛筆で書く: 紙をこするので始まりはゆっくり、終わりはなめらかに止まる（確認ページの鉛筆のバー）
  write: Easing.bezier(0.45, 0.05, 0.35, 1),
  // 蛍光ペンを一息で引く: さっと引いて、最後に少し止まる（確認ページの Highlighter）
  sweep: Easing.bezier(0.3, 0.1, 0.4, 1),
  // チェックの払い: 最後に鉛筆を上げるので、終わりが速い
  flick: Easing.bezier(0.55, 0, 0.25, 1),
  // くるくるの伸び縮み
  breathe: Easing.inOut(Easing.sin),
} as const;

// 手で4辺を引いた枠（kids-design-round2.md 2-4 の式）を、辺ごとの4本の線に分ける。
// 鉛筆は1本ずつ別の線にすると、角で重なった所が自然に濃くなる（同じ Path の中だと重なりが濃くならない）
export function handBoxSides(w: number, h: number, radius: number, seed: number, wobble: number): string[] {
  return handBoxPath(w, h, radius, seed, wobble)
    .split(" M ")
    .map((s, i) => (i === 0 ? s : `M ${s}`));
}

// 4辺のおおよその長さ（上・右・下・左）。書き始めの濃さ（押した所）を重ねる長さに使う
export function sideLengths(w: number, h: number): number[] {
  return [w + 2, h + 2, w + 2, h + 2];
}

// 線だけの丸いボタンの線: カプセルを一筆で描く。左上の直線から時計回りに回り、戻ってきて書き始めに少し重ねて終わる
// 返すのは2本: main（一周）と tail（戻ってきて重ねる所）。別の線にするので、重なった所が濃くなる
export function pillPath(w: number, h: number, seed: number, wobble = 0.4): { main: string; tail: string } {
  const r = rnd(seed);
  const j = () => (r() - 0.5) * 2 * wobble;
  const i = 0.9; // 線が箱の外に出ないよう内側へ
  const R = Math.max(1, (h - i * 2) / 2);
  const k = R * 0.5523; // 4分の1の円をベジェで描く係数
  const L = i + R; // 左の丸の中心の x
  const Rx = w - i - R; // 右の丸の中心の x
  const top = i;
  const bot = h - i;
  const sx = L + Math.min(10, (Rx - L) * 0.2); // 書き始め（上の辺の左寄り）
  let d = `M ${sx} ${top + 0.3 + j()}`;
  d += ` C ${sx + (Rx - sx) * 0.35} ${top + j()}, ${sx + (Rx - sx) * 0.7} ${top + j()}, ${Rx} ${top + j() * 0.5}`;
  d += ` C ${Rx + k} ${top}, ${w - i} ${top + R - k}, ${w - i + j() * 0.3} ${top + R}`;
  d += ` C ${w - i} ${top + R + k}, ${Rx + k} ${bot}, ${Rx} ${bot + j() * 0.5}`;
  d += ` C ${Rx - (Rx - L) * 0.35} ${bot + j()}, ${L + (Rx - L) * 0.35} ${bot + j()}, ${L} ${bot + j() * 0.5}`;
  d += ` C ${L - k} ${bot}, ${i} ${top + R + k}, ${i + j() * 0.3} ${top + R}`;
  const ly = top + j() * 0.5;
  d += ` C ${i} ${top + R - k}, ${L - k} ${top}, ${L} ${ly}`;
  // 戻ってきて、書き始めを少し越えて重ねる（重なった所が濃い）
  const tail = `M ${L} ${ly} C ${L + 3} ${top + 0.2}, ${sx + 2} ${top + 0.6 + j()}, ${sx + 6} ${top + 0.9}`;
  return { main: d, tail };
}

// 手で書いた丸（成功のチェックの丸）。24 の箱の真ん中、半径 9 前後。
// 右上から書き始めて左回りに回り、書き始めの少し下で終わる（右上はチェックの抜け道に空ける）。半径は少しだけ揺れる
export function handCircle(
  seed: number,
  cx = 12,
  cy = 12,
  radius = 9,
  from = 52,
  sweep = 332,
): { d: string; len: number } {
  const r = rnd(seed);
  const a1 = r() * Math.PI * 2;
  const a2 = r() * Math.PI * 2;
  const steps = 36;
  let d = "";
  let len = 0;
  let prev: [number, number] | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const deg = from - sweep * t; // 左回り（時計の12時から測った角度が減る）
    const a = (deg * Math.PI) / 180;
    // 半径のゆるい揺れ（2つの波）と、書き終わりで少し内へ入る
    const rr = radius + 0.35 * Math.sin(t * Math.PI * 2 + a1) + 0.25 * Math.sin(t * Math.PI * 3 + a2) - 0.5 * t * t;
    const x = cx + rr * Math.sin(a);
    const y = cy - rr * Math.cos(a);
    d += s === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    if (prev) len += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
  }
  return { d, len };
}

// 0 → 1 の動き（蛍光ペンの帯など）。start が true になったら delay 待って duration で。動きを減らすなら、すぐ 1。
// start が false に戻ったら 0（見えない）に戻す（選び直したタブなど。蛍光ペンは本当は消えないので、消える途中は見せない）
export function useStroke(
  start: boolean,
  delay: number,
  duration: number,
  easing: (t: number) => number = pencilEase.sweep,
  ready = true,
) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!start || !ready) {
      v.stopAnimation();
      v.setValue(0);
      return;
    }
    if (reduced) {
      v.stopAnimation();
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, delay, duration, easing, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [start, ready, reduced, delay, duration]);
  return v;
}

// 値を少し遅れて追いかける（円の蛍光ペンが、鉛筆の先を追う）。tau はおくれの時定数（ミリ秒）。
// 動きを減らすなら、追いかけずに同じ値。src が止まれば追いつく。押す操作は邪魔しない（JS の requestAnimationFrame で値だけ動かす）
export function useFollow(src: Animated.Value | Animated.AnimatedInterpolation<number>, tau: number) {
  const reduced = useReducedMotion();
  const read = () => (src as unknown as { __getValue(): number }).__getValue();
  const v = useRef(new Animated.Value(read())).current;
  useEffect(() => {
    let target = read();
    let cur = target;
    let frame: number | null = null;
    let last = 0;
    v.setValue(cur);
    const step = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      cur += (target - cur) * (1 - Math.exp(-dt / tau));
      if (Math.abs(target - cur) < 0.05) cur = target;
      v.setValue(cur);
      frame = cur === target ? null : requestAnimationFrame(step);
      if (frame == null) last = 0;
    };
    const id = src.addListener(({ value }) => {
      target = value;
      if (reduced) {
        cur = value;
        v.setValue(value);
        return;
      }
      if (frame == null) frame = requestAnimationFrame(step);
    });
    return () => {
      src.removeListener(id);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [src, tau, reduced]);
  return v;
}
