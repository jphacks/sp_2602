// tmp/animations/rnweb/whiteboard/components/pair/QrCard.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子14 の QR コード。props はアプリの QrCard（src/components/pair/QrCard.tsx）と同じ（code だけ）。
// QR に入れるのはチケットの code だけ（合言葉・個人情報は入れない。MVP_SPEC 4.1）。
// 形（Figma 子14・子14-B・子18）: 白い紙（qrBg）に黒の QR（qrFg）。紙のまわりに、今の道具の枠の線（useTool().FrameLine。
//   ホワイトボードは黒のマーカーで手で4辺を引いた線・角 8。黒板・ノートは紙の角にテープ1枚）。大きさは 242 の紙の中に 200 の QR（tokens.size.qrFrame・qr）。
// 読み取りやすさのため、どのモードでも白い紙に黒の点のまま（地の色や道具の色を QR に使わない。kids-design-rules.md 3 章）。
// 枠の形は毎回同じ（種を決めておく）。紙の大きさは決まっているので測らない。
import { tokens } from "@contracts/tokens";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useColors } from "@/lib/theme";
import { useTool } from "../../tools";

const FRAME = tokens.size.qrFrame;
const SEED = 2414; // 枠の揺れの種（QR の紙はいつも同じ形）

// memo: 子14 は残り時間を出すため毎秒描き直す。QR（SVG の点が数百個）は code が変わらない限り描き直さない（アプリと同じ）
export const QrCard = memo(function QrCard({ code }: { code: string }) {
  const c = useColors();
  const { FrameLine, Tape, values } = useTool();
  return (
    <View
      style={[styles.paper, { backgroundColor: c.qrBg, borderRadius: values.frame.radius }]}
      accessible
      accessibilityLabel="保護者に読み取ってもらう QR コード"
    >
      <QRCode value={code} size={tokens.size.qr} color={c.qrFg} backgroundColor={c.qrBg} />
      {/* 紙のふちの線（紙に重ねる。押す操作はない） */}
      <FrameLine w={FRAME} h={FRAME} seed={SEED} kind="card" />
      {/* 黒板・ノートは白い紙をテープ1枚で貼った形（道具の Tape。紙の角に。QR の点にはかからない。ホワイトボードはなし） */}
      {Tape ? <Tape w={FRAME} h={FRAME} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  paper: {
    width: FRAME,
    height: FRAME,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
});
