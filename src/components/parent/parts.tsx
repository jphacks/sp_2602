// 保護者の画面だけで使う小さい見た目の部品（Figma 親03・親09・親16 に1か所ずつ出てくるもの）。
//   AppInitial : アプリの頭文字のアイコン（薄い青の角丸四角・青い太字。親09・親16）
//   LinkCard   : 薄い青の横長のボタン「各アプリごとの利用時間を見る ›」（親03）
//   Note       : 薄いグレーの注意書き（線の「i」＋文。親03）
//   Strip      : 薄いグレーの全丸の帯（期間の表示。親03）
//   Badge      : 白い小さい札（「上限が 13% 減」。親03）
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, type IconName } from "@/components";

export function AppInitial({ initial }: { initial: string }) {
  return (
    <View style={styles.initial} importantForAccessibility="no-hide-descendants">
      <AppText variant="title" tone="primary">
        {initial}
      </AppText>
    </View>
  );
}

export function LinkCard({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Icon name={icon} color={tokens.color.primary} />
      <View style={styles.flex}>
        <AppText variant="body" tone="primary">
          {label}
        </AppText>
      </View>
      <Icon name="chevron_right" color={tokens.color.primary} />
    </Pressable>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Icon name="info" color={tokens.color.muted} />
      <View style={styles.flex}>
        <AppText tone="muted">{children}</AppText>
      </View>
    </View>
  );
}

export function Strip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.strip}>
      <AppText variant="label" center>
        {children}
      </AppText>
    </View>
  );
}

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <AppText variant="label" tone="primary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  initial: {
    width: tokens.size.appIcon,
    height: tokens.size.appIcon,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    minHeight: tokens.size.button,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.color.primarySoft,
  },
  pressed: { backgroundColor: tokens.color.primaryMuted },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space[3],
    padding: tokens.space[4],
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.color.surfaceDim,
  },
  strip: {
    paddingVertical: tokens.space[2],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceDim,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[1],
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface,
  },
});
