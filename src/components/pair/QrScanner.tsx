// 親11 QR読み取り中・親12 QR検証中のカメラの枠（Figma 108:9065・108:9077）。
// 黒い角丸の枠いっぱいにカメラを出し、上にヒントの帯、中央に白い四隅の読み取り枠を重ねる。
// 検証中（verifying）は暗くして、四隅をグレーにし、中央に「確かめています…」を出す。読み取りは止める（同じ QR を何度も送らない）。
import { tokens } from "@contracts/tokens";
import { type BarcodeScanningResult, type BarcodeSettings, CameraView } from "expo-camera";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { makeStyles, useColors } from "@/lib/theme";

// QR だけを読む（ほかのバーコードには反応しない）
const scannerSettings: BarcodeSettings = { barcodeTypes: ["qr"] };

type Props = {
  scanning: boolean; // 読み取るか（false のときは onScanned を呼ばない）
  verifying: boolean; // 親12 の見た目にするか
  onScanned: (data: string) => void;
};

export function QrScanner({ scanning, verifying, onScanned }: Props) {
  const styles = useStyles();
  const c = useColors();
  const onBarcode = scanning ? (r: BarcodeScanningResult) => onScanned(r.data) : undefined;
  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={scannerSettings}
        onBarcodeScanned={onBarcode}
      />
      {verifying && <View style={styles.dim} />}
      {!verifying && (
        <View style={styles.hint}>
          <AppText variant="label" tone="onPrimary" center>
            子どものスマホに出ているQRコードを枠に入れてね
          </AppText>
        </View>
      )}
      <View style={styles.center} pointerEvents="none">
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft, verifying && styles.cornerDim]} />
          <View style={[styles.corner, styles.topRight, verifying && styles.cornerDim]} />
          <View style={[styles.corner, styles.bottomLeft, verifying && styles.cornerDim]} />
          <View style={[styles.corner, styles.bottomRight, verifying && styles.cornerDim]} />
          {verifying && (
            <View style={styles.verifying} accessibilityLiveRegion="polite">
              <ActivityIndicator size="large" color={c.white} />
              <AppText tone="onPrimary" center>
                確かめています…
              </AppText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// 枠いっぱいに重ねる（カメラの上の暗幕・読み取り枠）
const fill = {
  position: "absolute",
  top: tokens.space[0],
  left: tokens.space[0],
  right: tokens.space[0],
  bottom: tokens.space[0],
} as const;
const cornerLength = tokens.space[12];
const cornerWidth = tokens.space[1];

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    camera: {
      flex: 1,
      borderRadius: tokens.radius.dialog,
      overflow: "hidden",
      backgroundColor: c.black,
    },
    dim: { ...fill, backgroundColor: c.scrim },
    hint: {
      position: "absolute",
      top: tokens.space[6],
      left: tokens.space[6],
      right: tokens.space[6],
      paddingVertical: tokens.space[2],
      paddingHorizontal: tokens.space[4],
      borderRadius: tokens.radius.card,
      backgroundColor: c.black,
    },
    center: { ...fill, alignItems: "center", justifyContent: "center" },
    viewfinder: {
      width: tokens.size.viewfinder,
      height: tokens.size.viewfinder,
      alignItems: "center",
      justifyContent: "center",
    },
    corner: {
      position: "absolute",
      width: cornerLength,
      height: cornerLength,
      borderColor: c.white,
    },
    cornerDim: { borderColor: c.muted },
    topLeft: {
      top: tokens.space[0],
      left: tokens.space[0],
      borderTopWidth: cornerWidth,
      borderLeftWidth: cornerWidth,
      borderTopLeftRadius: tokens.radius.md,
    },
    topRight: {
      top: tokens.space[0],
      right: tokens.space[0],
      borderTopWidth: cornerWidth,
      borderRightWidth: cornerWidth,
      borderTopRightRadius: tokens.radius.md,
    },
    bottomLeft: {
      bottom: tokens.space[0],
      left: tokens.space[0],
      borderBottomWidth: cornerWidth,
      borderLeftWidth: cornerWidth,
      borderBottomLeftRadius: tokens.radius.md,
    },
    bottomRight: {
      bottom: tokens.space[0],
      right: tokens.space[0],
      borderBottomWidth: cornerWidth,
      borderRightWidth: cornerWidth,
      borderBottomRightRadius: tokens.radius.md,
    },
    verifying: { alignItems: "center", gap: tokens.space[3] },
  }),
);
