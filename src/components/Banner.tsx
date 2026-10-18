// 帯の案内（Figma の Banner。アイコン＋文）。tone で色を変える: info（説明）/ warning（古いキャッシュなど）/ danger（エラー）/ success。
//   <Banner icon="edit" message="テストの名前と期間を入れてください" />
//   <Banner tone="warning" icon="cloud_off" message="最新でない可能性があります" />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { AppText, type TextTone } from "./AppText";
import { bannerBg as bg, bannerFg as fg, type BannerTone as Tone } from "./banner-tones";
import { Icon, type IconName } from "./Icon";

type Props = { message: string; hint?: string; icon?: IconName; tone?: Tone; action?: ReactNode };

// 地と文字・アイコンの色（色の名前）は banner-tones.ts の表を使う（白色・黒色で読めるかをテストで確かめるため、表は1か所に置く）
const textTone: Record<Tone, TextTone> = {
  info: "onPrimarySoft",
  warning: "warning",
  danger: "danger",
  success: "success",
};
const defaultIcon: Record<Tone, IconName> = {
  info: "info",
  warning: "warning",
  danger: "error",
  success: "check_circle",
};

export function Banner({ message, hint, icon, tone = "info", action }: Props) {
  const toneStyles = useToneStyles();
  const c = useColors();
  return (
    <View
      style={[styles.box, toneStyles[tone]]}
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon ?? defaultIcon[tone]} color={c[fg[tone]]} />
      <View style={styles.text}>
        {/* Figma 子03・子11・子14 の帯の文は 14 の太字 */}
        <AppText variant="label" tone={textTone[tone]} strong>
          {message}
        </AppText>
        {hint ? (
          <AppText variant="caption" tone={textTone[tone]}>
            {hint}
          </AppText>
        ) : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    padding: tokens.space[4],
    borderRadius: tokens.radius.md,
  },
  text: { flex: 1, gap: tokens.space[1] },
});

const useToneStyles = makeStyles((c) =>
  StyleSheet.create({
    info: { backgroundColor: c[bg.info] },
    warning: { backgroundColor: c[bg.warning] },
    danger: { backgroundColor: c[bg.danger] },
    success: { backgroundColor: c[bg.success] },
  }),
);
