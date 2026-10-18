// 保護者の画面だけで使う小さい見た目の部品（Figma 親03・親09・親16 に1か所ずつ出てくるもの）。
//   AppInitial : アプリの頭文字のアイコン（薄い青の角丸四角・青い太字。アイコンがまだ届いていないときの仮のアイコン）
//   AppIcon    : 子どもの端末から届いた本物のアイコン（親09・親16。Q15）。uri がない・読めないときは AppInitial
//   LinkCard   : 薄い青の横長のボタン「各アプリごとの利用時間を見る ›」（親03）
//   Note       : 薄いグレーの注意書き（線の「i」＋文。親03）
//   Strip      : 薄いグレーの全丸の帯（期間の表示。親03）
//   Badge      : 白い小さい札（「上限が 13% 減」。親03）
//   Toggle     : スイッチ（Figma 親16 の 52×32 の丸いスイッチ。ON は青地に白い大きいつまみ（ダークは明るい青地に紺）、OFF は枠とグレーの小さいつまみ）。
//                Android の標準の Switch は小さく形も違うため、Figma の形で描く
import { tokens } from "@contracts/tokens";
import { type ReactNode, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, type IconName } from "@/components";
import { makeStyles, useColors } from "@/lib/theme";

export function AppInitial({ initial }: { initial: string }) {
  const styles = useStyles();
  return (
    <View style={styles.initial} importantForAccessibility="no-hide-descendants">
      <AppText variant="title" tone="primary">
        {initial}
      </AppText>
    </View>
  );
}

// uri は src/lib/app-icons.ts の useAppIcons が返す data: の URI。画像を読めなかったら頭文字に戻す（空白にしない）
export function AppIcon({ initial, uri }: { initial: string; uri?: string | null }) {
  const styles = useStyles();
  // 読めなかった画像（新しい画像になったら、もう一度出してみる）
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (!uri || failedUri === uri) return <AppInitial initial={initial} />;
  return (
    <Image
      source={{ uri }}
      style={styles.icon}
      onError={() => setFailedUri(uri)}
      accessibilityIgnoresInvertColors
      importantForAccessibility="no"
    />
  );
}

export function LinkCard({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const styles = useStyles();
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Icon name={icon} color={c.primary} />
      <View style={styles.flex}>
        {/* Figma 親03 は1行の太字。body だと文字を大きくした端末で「る」だけ次の行に落ちる */}
        <AppText variant="label" tone="primary" strong>
          {label}
        </AppText>
      </View>
      <Icon name="chevron_right" color={c.primary} />
    </Pressable>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const c = useColors();
  return (
    <View style={styles.note}>
      <Icon name="info" color={c.muted} />
      <View style={styles.flex}>
        <AppText variant="small" tone="muted">
          {children}
        </AppText>
      </View>
    </View>
  );
}

export function Strip({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.strip}>
      <AppText variant="label" center>
        {children}
      </AppText>
    </View>
  );
}

export function Toggle(props: {
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const { value, onValueChange, disabled, accessibilityLabel } = props;
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={tokens.space[2]}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}
    >
      <View style={value ? styles.thumbOn : styles.thumbOff} />
    </Pressable>
  );
}

export function Badge({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <AppText variant="label" tone="primary" strong>
        {label}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1 },
    initial: {
      width: tokens.size.appIcon,
      height: tokens.size.appIcon,
      borderRadius: tokens.radius.sm,
      backgroundColor: c.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    // 本物のアイコン（頭文字の四角と同じ大きさ。アイコン自体の形で切り抜かれているので角は丸めるだけ）
    icon: { width: tokens.size.appIcon, height: tokens.size.appIcon, borderRadius: tokens.radius.sm },
    link: {
      minHeight: tokens.size.button,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      paddingHorizontal: tokens.space[4],
      borderRadius: tokens.radius.card,
      backgroundColor: c.primarySoft,
    },
    pressed: { backgroundColor: c.primaryMuted },
    note: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      padding: tokens.space[4],
      borderRadius: tokens.radius.card,
      backgroundColor: c.surfaceDim,
    },
    strip: {
      paddingVertical: tokens.space[2],
      paddingHorizontal: tokens.space[4],
      borderRadius: tokens.radius.pill,
      backgroundColor: c.surfaceDim,
    },
    track: {
      width: tokens.size.switchWidth,
      height: tokens.size.switchHeight,
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.space[1],
      flexDirection: "row",
      alignItems: "center",
    },
    trackOn: { backgroundColor: c.primary, justifyContent: "flex-end" },
    trackOff: {
      borderWidth: tokens.size.switchBorder,
      borderColor: c.outline,
      justifyContent: "flex-start",
    },
    thumbOn: {
      width: tokens.size.switchThumbOn,
      height: tokens.size.switchThumbOn,
      borderRadius: tokens.radius.pill,
      backgroundColor: c.switchThumbOn,
    },
    thumbOff: {
      width: tokens.size.switchThumbOff,
      height: tokens.size.switchThumbOff,
      marginHorizontal: tokens.space[1],
      borderRadius: tokens.radius.pill,
      backgroundColor: c.outline,
    },
    disabled: { opacity: 0.5 },
    badge: {
      alignSelf: "flex-start",
      paddingHorizontal: tokens.space[3],
      paddingVertical: tokens.space[1],
      borderRadius: tokens.radius.pill,
      backgroundColor: c.surface,
    },
  }),
);
