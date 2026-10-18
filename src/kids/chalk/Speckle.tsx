// tmp/animations/rnweb/whiteboard/chalk/Speckle.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 粒の画像を敷き詰める（Image の repeat）。黒板の粒・棒のくぼみ・粉受けの粉・消し跡で使う。
// ImageBackground は React Native で非推奨（端末の logcat に注意が出る）なので、外の箱（View）の中に絶対位置の Image を置く。
//   ImageBackground と同じに見えるよう、Image の大きさは必ず書く（書かないと、端末では source の大きさ 192×192 などになる）
// 確認ページ（react-native-web）で粒が見えなくなるのを防ぐ決まり（アプリの端末でも害はない）:
//   - 外の箱に zIndex: 0 を付けて重なりの場を作る（react-native-web は画像の地の層を z-index -1 にする。
//     ImageBackground は画像そのものも -1 にしていたので、場がないと親の地の後ろに回った。Image にした今も、念のため残す）
//   - repeat の画像の箱は、いつも画像より大きく取って（SPAN）、外の箱で切り取る。react-native-web は、箱が画像より小さいと
//     画像を箱に合わせて縮める（高さ 59 の帯なら 192 の画像が 59 に縮み、点が 0.3px になって消える）。
//     端末（Android）の repeat も同じで、箱（画素）が画像（画素）より小さいと縮めてから並べる（左上から並べる）
//   - 画像の大きさ（px）を source に書く（書かないと、箱の大きさから画像の大きさを決めてしまう）
import { Image, type ImageResizeMode, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

type Props = {
  src: unknown;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
};

const SPAN = 1200; // 画面より大きい（どの箱でも画像が縮まない）

// require した画像（アプリでは数）と、埋め込んだ data URL（確認ページでは文字）のどちらでも読める形にする
export function speckleSource(src: unknown, width: number, height: number) {
  return typeof src === "string" ? { uri: src, width, height } : (src as number);
}

export function Speckle({ src, width, height, style, resizeMode = "repeat" }: Props) {
  const source = speckleSource(src, width, height);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.clip, style]}>
      <Image source={source} resizeMode={resizeMode} style={resizeMode === "repeat" ? s.span : s.fill} />
    </View>
  );
}

const s = StyleSheet.create({
  clip: { overflow: "hidden", zIndex: 0 },
  span: { position: "absolute", left: 0, top: 0, width: SPAN, height: SPAN },
  fill: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
});
