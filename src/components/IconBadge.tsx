// 大きいアイコンの丸（96×96。QR・連携の画面の Message 領域の上、Figma の IconBadge）。
//   <IconBadge icon="check" tone="success" />
// 丸の色は tone、アイコンの色は iconTone（省くと tone と同じ）。Figma 子16・子19・親14・親15 は
// 丸は薄い青（info）のまま、アイコンだけ赤・緑: <IconBadge icon="error" iconTone="danger" />
import { type ColorName, tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
type Props = { icon: IconName; tone?: Tone; iconTone?: Tone };

// アイコンの色（色の名前。値は今のテーマから引く）
const fg: Record<Tone, ColorName> = {
  info: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function IconBadge({ icon, tone = "info", iconTone }: Props) {
  const toneStyles = useToneStyles();
  const c = useColors();
  return (
    <View style={[styles.badge, toneStyles[tone]]}>
      <Icon name={icon} size={tokens.size.iconBadgeGlyph} color={c[fg[iconTone ?? tone]]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: tokens.size.iconBadge,
    height: tokens.size.iconBadge,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});

const useToneStyles = makeStyles((c) =>
  StyleSheet.create({
    info: { backgroundColor: c.primarySoft },
    success: { backgroundColor: c.successSoft },
    warning: { backgroundColor: c.warningSoft },
    danger: { backgroundColor: c.dangerSoft },
  }),
);
