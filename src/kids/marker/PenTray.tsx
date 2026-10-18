// tmp/animations/rnweb/whiteboard/marker/PenTray.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 下のタブの地（ホワイトボード）: アルミのペン置き。上に 2px の縁 #AEB4BB、上から下へ明るい銀 → 少し暗い銀のグラデーション（Figma の TabBar）。
// 地の色を塗らず、ここで描く（下の安全領域の分まで同じ銀）。tabBarBackground に渡す
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { marker } from "../theme/tool";

export function PenTray() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="wbTray" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={marker.trayFrom} />
            <Stop offset="0.12" stopColor={marker.trayMid} />
            <Stop offset="1" stopColor={marker.trayTo} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wbTray)" />
        <Rect x="0" y="0" width="100%" height="2" fill={marker.trayTop} />
      </Svg>
    </View>
  );
}
