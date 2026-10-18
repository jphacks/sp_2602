// 子14 の QR コード（白い角丸の枠の中に QR）。QR に入れるのはチケットの code だけ（合言葉・個人情報は入れない。MVP_SPEC 4.1）。
// 読み取りやすさのため、ダークでも白地に黒の点のまま（色の名前 qrFg・qrBg。Figma 子14 のダークも白地）。
import { tokens } from "@contracts/tokens";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { makeStyles, useColors } from "@/lib/theme";

// memo: 子14 は残り時間を出すため毎秒描き直す。QR（SVG の点が数百個）は code が変わらない限り描き直さない
export const QrCard = memo(function QrCard({ code }: { code: string }) {
  const styles = useStyles();
  const c = useColors();
  return (
    <View style={styles.frame} accessible accessibilityLabel="保護者に読み取ってもらう QR コード">
      <QRCode value={code} size={tokens.size.qr} color={c.qrFg} backgroundColor={c.qrBg} />
    </View>
  );
});

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    frame: {
      width: tokens.size.qrFrame,
      height: tokens.size.qrFrame,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.qrBg,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
  }),
);
