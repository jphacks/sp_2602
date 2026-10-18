// tmp/animations/rnweb/whiteboard/chalk/ChalkExtras.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 黒板の道具の小さい部品（土台の担当が足した。黒板の担当の了承済み）。役目は tools/index.tsx の Tool:
//   ChalkBadgeFill  … 大きいアイコンの丸の地（BadgeFill）: 一段明るい黒板＋粒（Figma 子15・子16・子19 の黒板）
//   ChalkTitleGrain … 上のバーの「Slope」・題名の上に重ねる粒（TitleGrain）: 黒板の地の色の点で、チョークの字が少しかすれる
//   ChalkWidgetFrame… ウィジェットの枠（WidgetFrame）: 木の枠の小さい黒板（Figma 子12・子12-B の黒板。枠 4・角 4・内側に溝の影）
import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { chalk } from "../theme/chalk";
import { ChalkGrain } from "./ChalkFrame";

export function ChalkBadgeFill({ size }: { size: number }) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: chalk.surface, overflow: "hidden" }]}
    >
      <ChalkGrain filled radius={size / 2} />
    </View>
  );
}

export function ChalkTitleGrain() {
  return <ChalkGrain filled={false} radius={0} />;
}

export function ChalkWidgetFrame({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    // 呼ぶ側の箱（幅・高さ・内側の余白）はそのまま使い、枠の線（border）と角だけ木の枠に置き換える
    <View style={[style, styles.wood]}>
      <View pointerEvents="none" style={styles.groove} />
      {children}
      <ChalkGrain filled={false} radius={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 木の枠（明るい木の色の線 4。外側は少し暗い木口）
  wood: { borderWidth: 4, borderColor: chalk.wood, borderRadius: 4, backgroundColor: chalk.board },
  // 枠のすぐ内側の溝の影（黒板の板が枠に入っている所）
  groove: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: chalk.woodGroove,
    borderRadius: 2,
  },
});
