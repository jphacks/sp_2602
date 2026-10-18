// tmp/animations/rnweb/whiteboard/pencil/NoteTabBackground.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 下のタブの地（ノート）。ノートのページの一番下: 罫はそこで終わり、定規で引いたような、まっすぐな少し濃い線で区切る（EXPRESSION.md 1-17）。
// 紙 #ECE2CD（罫なし）＋上の縁に #545454・太さ 1.4 のまっすぐな線＋紙の粒。動かさない。下の安全領域の分まで同じ紙。
// tabBarBackground に渡す（useTabBarOptions）。
import { StyleSheet, View } from "react-native";
import { pencil } from "../theme/pencil";
import { Grain } from "./Grain";

export function NoteTabBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, s.paper]} pointerEvents="none">
      <View style={s.line} />
      <Grain />
    </View>
  );
}

const s = StyleSheet.create({
  paper: { backgroundColor: pencil.paper },
  line: { position: "absolute", left: 0, right: 0, top: 0, height: 1.4, backgroundColor: pencil.tabLine },
});
