// tmp/animations/rnweb/whiteboard/chalk/ChalkTray.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 下のタブの地（黒板）: 黒板の下の粉受け（チョーク置き）。tabBarBackground に渡す（下の安全領域の分まで同じ地）。
// 本物の粉受けは、黒板の下に付いた細い溝。手前の縁が光って細い明るい線に見え、その下は影の溝、奥にはダストレスでも少し粉がたまる。
// 形（Figma の TabBar）: 地 #13201C。いちばん上に黒板との境の影 1、光る縁 1.6、溝の影 1。その下 14px にうすい粉の点（上ほど多い）。
// 動かさない。
import { StyleSheet, View } from "react-native";
import dust from "../assets/chalk/dust.png";
import { chalk } from "../theme/chalk";
import { Speckle } from "./Speckle";

export function ChalkTray() {
  return (
    <View style={[StyleSheet.absoluteFill, s.tray]} pointerEvents="none">
      <Speckle src={dust} width={160} height={14} style={s.dust} />
      <View style={s.edge} />
      <View style={s.lip} />
      <View style={s.groove} />
    </View>
  );
}

const s = StyleSheet.create({
  tray: { backgroundColor: chalk.tray },
  edge: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: chalk.trayGroove, opacity: 0.7 },
  lip: { position: "absolute", left: 0, right: 0, top: 1, height: 1.6, backgroundColor: chalk.trayLip },
  groove: { position: "absolute", left: 0, right: 0, top: 2.6, height: 1, backgroundColor: chalk.trayGroove },
  dust: { position: "absolute", left: 0, right: 0, top: 3.6, height: 14 },
});
