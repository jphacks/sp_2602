// tmp/animations/rnweb/whiteboard/chalk/EraserHaze.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 画面の地の模様（黒板）: 黒板消しで横に往復した、うすい消し跡（白 2〜4% の横長のむら）。Screen が本文の後ろに敷く。
// 授業のあとの黒板は、消しても粉が少し残って、横長のむらになる（ホワイトボードは消すときれいになるので模様を付けない）。
// 文字の読みやすさは変えない（地の色が 1〜2 段明るくなるだけ）。画面ごとに同じ形で、動かさない。
// 画像は chalk/make-assets.mjs の haze.png（画面の半分の大きさ。なめらかなので伸ばして敷く）。
import { StyleSheet, View } from "react-native";
import haze from "../assets/chalk/haze.png";
import { Speckle } from "./Speckle";

export function EraserHaze() {
  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Speckle src={haze} width={180} height={400} resizeMode="stretch" />
    </View>
  );
}
