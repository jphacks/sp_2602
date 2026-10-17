// 子14 の QR コード（白い角丸の枠の中に QR）。QR に入れるのはチケットの code だけ（合言葉・個人情報は入れない。MVP_SPEC 4.1）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export function QrCard({ code }: { code: string }) {
  return (
    <View style={styles.frame} accessible accessibilityLabel="保護者に読み取ってもらう QR コード">
      <QRCode value={code} size={tokens.size.qr} color={tokens.color.text} backgroundColor={tokens.color.surface} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: tokens.size.qrFrame,
    height: tokens.size.qrFrame,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
});
