// tmp/animations/rnweb/whiteboard/chalk/draw.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// チョークで描く動きの道具。決まり（動きを減らす・値が分からないときは動かさない・今の位置から）は marker/draw.ts と同じで、
// そこにある useDraw・bezier・rnd・useSize をそのまま使う。ここに足すのは、チョークだけの性質（chalk/EXPRESSION.md の 0 章）:
//   - 摩擦: 線を引く速さは ease-in-out（ease.drag）。マーカーの「キュッ」（さっと引いて止まる）にしない
//   - 粉が凸にだけ乗る: 線の上に、地の色の小さな点の穴を開ける（holeDash。SVG の Mask で穴にする。地の色を知らなくてよい）
import { useId } from "react";
import { Easing } from "react-native";

export { bezier, rnd, useDraw, useSize } from "../marker/draw";

// 粒を散らす乱数（mulberry32。themes/grain.mjs と同じ）。marker/draw.ts の rnd（線形合同法）は、続けて取った2つの数が
// 斜めの線の上に並ぶので、(x, y) の点を散らすと斜めの筋になる。だから粒にはこちらを使う
export function grainRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  // 板の上を引きずる: 動き出しに少し力が要り、一定の速さで引いて、最後はゆっくり浮く
  drag: Easing.bezier(0.42, 0, 0.35, 1),
  // 棒を押し出して止める（使った割合・確認ページの黒板のバー）
  push: Easing.out(Easing.quad),
} as const;

// SVG の id（Mask の名前）。useId の「:」などを取り除く（url(#…) で読めるように）
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

// 点の穴の並び（strokeDasharray）。ほぼ長さ 0 の線を丸い端で描くと点になる。間はばらばら（種で決まる。毎回同じ）
export function holeDash(seed: number, minGap: number, maxGap: number, count = 23): string {
  const r = grainRandom(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push("0.01", (minGap + r() * (maxGap - minGap)).toFixed(2));
  return parts.join(" ");
}

// 一面に散らす細かい点（tile × tile の模様の中）。3つの濃さごとに1本の Path（小さな円をつないだもの）にする。
// 曲がった線・斜めの線は、どの向きでも同じように粒が散るよう、通り道（holeLanes）でなくこれを穴にする（ChalkStroke）
//   per: 1 つの点あたりの広さ（px²）。小さいほど点が多い
export function speckPaths(seed: number, tile: number, unit = 1, per = 11): { d: string; tone: string }[] {
  const r = grainRandom(seed * 7 + 3);
  const count = Math.round((tile * unit) ** 2 / per);
  const tones = ["#000000", "#2A2A2A", "#5A5A5A"];
  const parts: string[][] = [[], [], []];
  for (let i = 0; i < count; i++) {
    const x = r() * tile;
    const y = r() * tile;
    const rad = (0.3 + r() * 0.35) / unit;
    const t = Math.floor(r() * 3);
    parts[t]?.push(
      `M${(x - rad).toFixed(2)} ${y.toFixed(2)}a${rad.toFixed(2)} ${rad.toFixed(2)} 0 1 0 ${(rad * 2).toFixed(2)} 0a${rad.toFixed(2)} ${rad.toFixed(2)} 0 1 0 ${(-rad * 2).toFixed(2)} 0`,
    );
  }
  return parts.map((p, i) => ({ d: p.join(""), tone: tones[i] ?? "#000000" })).filter((p) => p.d);
}

// 線の太さに合わせた穴の通り道（線の真ん中から左右へずらす量・穴の大きさ・間・抜けの強さ）。
// 1本1本の通り道はまばらにして、たくさん重ねる（通り道が点線に見えないように）。縁の近くに多く置くと、線の縁がざらつく（粉の縁）。
//   unit: 1 の座標が何 px か（viewBox が 24 のアイコンなど）。穴は画面の上で 0.6〜1.2px
//   tone: 抜けの強さ（黒＝地がそのまま見える、灰＝少し粉が残る）。細い線（2px より細い）は穴を小さく・うすく・まばらに
export function holeLanes(width: number, seed: number, unit = 1) {
  const px = width * unit;
  const n = Math.max(4, Math.round(px / 0.55));
  const r = grainRandom(seed * 13 + 7);
  const spread = Math.max(1, n / 9) * (px < 2 ? 1.6 : 1);
  const fine = Math.min(1, px / 2.4); // 細い線では穴を小さく（線を横切って切れて見えないように） // 太い線は通り道が多いので、1本ごとの間を広げて、長さあたりの抜けの数をそろえる
  return Array.from({ length: n }, (_, k) => {
    // 2.6px より細い線は縁だけ（真ん中に穴が並ぶと二重線に見える）、ふつうの線は3本に2本、太い線は半分を縁の近くに
    const edge = px < 2.6 ? true : px < 6 ? k % 3 !== 2 : k % 2 === 0;
    const side = r() < 0.5 ? -1 : 1;
    const off = edge ? side * width * (0.36 + r() * 0.14) : (r() - 0.5) * width * 0.6;
    return {
      off,
      dot: ((0.6 + r() * 0.6) * fine) / unit,
      dash: holeDash(seed + k * 31, ((edge ? 7 : 12) * spread) / unit, ((edge ? 24 : 40) * spread) / unit, 15),
      start: (r() * 20) / unit,
      tone:
        (px < 2 ? ["#404040", "#606060", "#808080"] : ["#000000", "#202020", "#555555"])[Math.floor(r() * 3)] ??
        "#000000",
    };
  });
}
