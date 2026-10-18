// tmp/animations/rnweb/whiteboard/pencil/PencilShapes.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 鉛筆（トンボ 8900）の形の部品。確認ページの NotePencilBar（rnweb/themes/parts.tsx）の形をそのまま引き継ぐ
// （ユーザーの「手作り感のある・絵柄に合った鉛筆の形に」への答え。線は芯の色 1.15 で、少しだけ傾いた手描きの形）。
// 横向き（使った割合のバー）と縦向き（週の棒）で同じ形を使う。縦向きは、横向きの形を回して描く（形を2つ持たない）。
//   消しゴム＋金具 20 × 18 ／ 削った先（木と芯）26 × 18 ／ 軸は長さだけ変わる（面の線2本・下側の影・紙の粒）
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { pencil } from "../theme/pencil";

export const PENCIL_H = 18; // 鉛筆の太さ（横向きの高さ）
export const END_W = 20; // 消しゴム＋金具の長さ
export const TIP_W = 26; // 削った先の長さ
export const PENCIL_FIXED = END_W + TIP_W; // 長さが変わらない所（46）
const LINE = 1.15;

// 横向き（左が消しゴム、右が芯）の形
function EndPaths() {
  return (
    <>
      <Path
        d="M10.4 1.1 H4.8 Q1.2 1.3 1.1 4.7 L1.2 13.2 Q1.4 16.8 4.9 16.9 H10.4 Z"
        fill={pencil.eraser}
        stroke={pencil.lead}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <Path d="M3.2 13.4 Q4.6 14.9 7.1 14.5" stroke={pencil.lead} strokeWidth={0.6} opacity={0.5} fill="none" />
      <Path
        d="M10.2 0.8 L19.9 0.9 L20 17.1 L10.3 17.2 Z"
        fill={pencil.ferrule}
        stroke={pencil.lead}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <Path d="M13.4 1.2 L13.5 16.8 M16.6 1.1 L16.7 16.9" stroke={pencil.lead} strokeWidth={0.7} opacity={0.65} />
    </>
  );
}
function TipPaths() {
  return (
    <>
      <Path
        d="M0.2 0.7 L2.7 3.1 L0.9 6.1 L3.1 9 L1 11.9 L2.6 15 L0.2 17.3 L25.3 9.3 Z"
        fill={pencil.wood}
        stroke={pencil.lead}
        strokeWidth={LINE}
        strokeLinejoin="round"
      />
      <Path d="M17.4 6.6 L25.6 9.2 L17.5 11.9 Q18.9 9.3 17.4 6.6 Z" fill={pencil.lead} />
      <Path d="M5.1 5.4 L11 7.5 M5.6 12.7 L10.2 11.1" stroke={pencil.lead} strokeWidth={0.6} opacity={0.45} />
    </>
  );
}

// 横向き: scale で太さを変える（thin のバーは 0.6）
export function PencilEnd({ scale = 1 }: { scale?: number }) {
  return (
    <Svg width={END_W * scale} height={PENCIL_H * scale} viewBox={`0 0 ${END_W} ${PENCIL_H}`}>
      <EndPaths />
    </Svg>
  );
}
export function PencilTip({ scale = 1 }: { scale?: number }) {
  return (
    <Svg
      width={TIP_W * scale}
      height={PENCIL_H * scale}
      viewBox={`0 0 ${TIP_W} ${PENCIL_H}`}
      style={{ marginLeft: -0.6 * scale }}
    >
      <TipPaths />
    </Svg>
  );
}

// 縦向き（上が芯、下が消しゴム）。横向きの形を左へ 90° 回す: (x, y) → (y × k, 長さ − x)。k は太さの倍率（幅 width ÷ 18）
export function PencilEndUp({ width, length = END_W }: { width: number; length?: number }) {
  const k = width / PENCIL_H;
  const l = length / END_W;
  return (
    <Svg width={width} height={length} viewBox={`0 0 ${width} ${length}`} style={{ marginTop: -0.6 }}>
      <G transform={`translate(0 ${length}) rotate(-90) scale(${l} ${k})`}>
        <EndPaths />
      </G>
    </Svg>
  );
}
export function PencilTipUp({ width, length = TIP_W }: { width: number; length?: number }) {
  const k = width / PENCIL_H;
  const l = length / TIP_W;
  return (
    <Svg width={width} height={length} viewBox={`0 0 ${width} ${length}`} style={{ marginBottom: -0.6 }}>
      <G transform={`translate(0 ${length}) rotate(-90) scale(${l} ${k})`}>
        <TipPaths />
      </G>
    </Svg>
  );
}

// 軸の面の線（鉛筆は六角形なので、面の境目が2本見える）と下側の影
export function Facets({ vertical = false, scale = 1 }: { vertical?: boolean; scale?: number }) {
  const at = [5.4 * scale, 11 * scale];
  return (
    <>
      {at.map((p) => (
        <View
          key={p}
          pointerEvents="none"
          style={
            vertical
              ? {
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: p,
                  width: 0.7,
                  backgroundColor: pencil.lead,
                  opacity: 0.35,
                }
              : {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: p,
                  height: 0.7,
                  backgroundColor: pencil.lead,
                  opacity: 0.35,
                }
          }
        />
      ))}
      <View
        pointerEvents="none"
        style={
          vertical
            ? { position: "absolute", top: 0, bottom: 0, right: 0, width: 5.5 * scale, backgroundColor: pencil.shade }
            : { position: "absolute", left: 0, right: 0, bottom: 0, height: 5.5 * scale, backgroundColor: pencil.shade }
        }
      />
    </>
  );
}
