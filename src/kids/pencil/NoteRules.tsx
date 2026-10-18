// tmp/animations/rnweb/whiteboard/pencil/NoteRules.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ノートの罫線（MD ノートの 7mm の横罫を、画面の 28 ごとに）。罫は印刷なので、まっすぐで揺れず、動かない。
//   NoteBackdrop … 画面の地（Screen が本文の後ろに敷く）。上のバーの下（上から 76）から、画面の下まで。上の余白には罫を描かない（MD ノートの頭の余白）
//   PaperRules   … ダイアログの紙の中の罫（切り取ったノートの紙）
// 縦の線（余白の線）は描かない（MD ノートの横罫にはない）。罫の色 #A7AEB9・太さ 0.8・不透明度 0.6（確認ページで決めた値）。
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pencil } from "../theme/pencil";
import { useSize } from "./draw";

export const RULE_GAP = 28; // 7mm
export const RULE_TOP = 76; // 画面の上から最初の罫まで（Figma 子01: 上のバー 64 の下）
const RULE = { height: 0.8, opacity: 0.6 } as const;

function Rules({ height, first, inset = 0 }: { height: number; first: number; inset?: number }) {
  const count = height > first ? Math.floor((height - first) / RULE_GAP) + 1 : 0;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: RULE.opacity }]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.rule, { top: first + i * RULE_GAP, left: inset, right: inset }]} />
      ))}
    </View>
  );
}

// 画面の地の罫（Backdrop）。端末の上の安全領域の分だけ下げる
export function NoteBackdrop() {
  const insets = useSafeAreaInsets();
  const [{ h }, onLayout] = useSize();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {h > 0 && <Rules height={h} first={RULE_TOP + insets.top} />}
    </View>
  );
}

// ダイアログの紙の中の罫（中身の後ろ）。紙の端から端まで、角の丸の内側から
export function PaperRules({
  width: _w,
  height,
  first = 26,
  radius = 4,
}: {
  width: number;
  height: number;
  first?: number;
  radius?: number;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      <Rules height={height - 4} first={first} />
    </View>
  );
}

const s = StyleSheet.create({
  rule: { position: "absolute", height: RULE.height, backgroundColor: pencil.rule },
});
