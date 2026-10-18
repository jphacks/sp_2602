// tmp/animations/rnweb/whiteboard/marker/MarkerBar.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 使った割合の線（子01 系・子11・子12）。緑マーカーで左から引く（マーカーは短くならないので、引いた線の長さ＝使った割合）。
// 下に、上限までの道筋をうすく引いておく（3px。点線の枠は使わない）。
// 形は Figma 子01 の ProgressTrack に合わせた: 太さ 13、端はほぼ四角（角 1.5）、線の上に少しだけ乾いたマーカーの筋（白板の色の細い抜け）。
// （確認ページ parts.tsx の MarkerBar は端を丸め、真ん中に芯の筋を入れていたが、Figma の画像は四角い端・筋なしなので Figma に合わせた）
// 長さ（px）は呼ぶ側が動かす（ProgressBar・useTween）。
//   <MarkerBar length={width} />   … width は Animated.Value（px）。0 なら何も見えない
import { Animated, Image, StyleSheet, View } from "react-native";
import dry from "../assets/marker-dry.png";
import { stroke } from "../theme/tool";
import { useToolColors } from "../tools/scheme-colors";

type Len = Animated.Value | Animated.AnimatedInterpolation<number> | number;
type Props = { length: Len; color?: string; thin?: boolean; showPath?: boolean };

// アプリでは require した画像（数）、確認ページでは埋め込んだ data URL（文字）になる
const drySource = typeof dry === "string" ? { uri: dry } : dry;

export function MarkerBar({ length, color, thin = false, showPath = true }: Props) {
  const colors = useToolColors("marker"); // 色は今の配色（color を渡さなければ使った時間の色）
  const h = thin ? 8 : stroke.bar;
  return (
    <View style={[s.track, thin && s.trackThin]}>
      {showPath && <View style={[s.path, { backgroundColor: colors.path }]} />}
      <Animated.View style={[s.line, { width: length as never, height: h, backgroundColor: color ?? colors.used }]}>
        <Image source={drySource} resizeMode="repeat" style={s.dry} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: 24, justifyContent: "center" },
  trackThin: { height: 12 },
  path: { position: "absolute", left: 0, right: 0, height: stroke.barPath, borderRadius: stroke.barPath / 2 },
  line: { position: "absolute", left: 1, borderRadius: 1.5, overflow: "hidden" },
  // 乾いたマーカーの筋（ごくうすく。理由のないざらつきにしない）。線の箱いっぱいに敷き詰める
  // （ImageBackground は非推奨なので Image で。大きさを書かないと、端末では画像の大きさ 192×192 になる）
  dry: { ...StyleSheet.absoluteFill, width: "100%", height: "100%", opacity: 0.5 },
});
