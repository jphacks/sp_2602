// tmp/animations/rnweb/whiteboard/pencil/Grain.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 紙の粒（Figma の NOISE と同じ）。紙の色の小さな点を、鉛筆の線や文字の上に重ねる。点のある所だけ線が欠けて、
// 紙の目に黒鉛が乗らなかった所のように、かすれて見える（rnweb/themes/grain.mjs で作った paper.png）。
// 上に重ねるだけで、押す操作は下へ通す。ImageBackground は非推奨なので、切り取る箱（View）の中に絶対位置の Image を置く
// （大きさを書かないと、端末では画像の大きさ 192×192 になるので、箱いっぱいと書く）。
//   <Grain radius={4} />          … 枠の箱の中（カード・帯・ダイアログ）
//   <Grain heavy />               … 塗りの濃い所（鉛筆の軸）
import { Image, StyleSheet, View } from "react-native";
import paper from "../assets/pencil/paper.png";
import paperHeavy from "../assets/pencil/paper-heavy.png";

// アプリでは require した画像（数）、確認ページでは埋め込んだ data URL（文字）になる
const src = (img: unknown) => (typeof img === "string" ? { uri: img } : (img as number));
const light = src(paper);
const heavy = src(paperHeavy);

export function Grain({
  radius = 0,
  heavy: isHeavy = false,
  opacity = 1,
}: {
  radius?: number;
  heavy?: boolean;
  opacity?: number;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden", opacity }]}>
      <Image source={isHeavy ? heavy : light} resizeMode="repeat" style={s.fill} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
});
