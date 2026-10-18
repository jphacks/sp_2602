// 小さい札（Figma の StatusChip「ちょうどいいペース！」・Chip/pending「反映待ち」・ExpiryChip「あと 9分41秒…」）。
//   <Chip icon="check_circle" label="ちょうどいいペース！" />  <Chip tone="warning" label="反映待ち" />
import { type ColorName, tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
// align: 札の置き場所（既定は中央。一覧の上の「反映待ち」のように左の文とそろえるときは "start"）
// small: 行の中の小さい札（Figma 親16 の行の「反映待ち」。文字 12）
type Props = { label: string; icon?: IconName; tone?: Tone; align?: "center" | "start"; small?: boolean };

// アイコンの色（色の名前。値は今のテーマから引く）
const fg: Record<Tone, ColorName> = {
  info: "onPrimarySoft",
  success: "success",
  warning: "warning",
  danger: "danger",
};
const textTone: Record<Tone, TextTone> = {
  info: "onPrimarySoft",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function Chip({ label, icon, tone = "info", align = "center", small = false }: Props) {
  const toneStyles = useToneStyles();
  const c = useColors();
  return (
    <View style={[styles.chip, toneStyles[tone], align === "start" && styles.start, small && styles.small]}>
      {icon && <Icon name={icon} size={tokens.size.iconSmall} color={c[fg[tone]]} />}
      {/* Figma の札の文字は太字（子02「ちょうどいいペース！」・子14「あと 9分41秒…」）。
          長い文（「今の計画は子どものスマホへの反映待ち」）は、文字を大きくした端末で札が画面の外へはみ出さないよう、
          アイコンの横で折り返す（Text は行の中で縮まないので、縮められる箱に入れる） */}
      <View style={styles.label}>
        <AppText variant={small ? "caption" : "label"} tone={textTone[tone]} strong>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[1],
    borderRadius: tokens.radius.pill,
  },
  label: { flexShrink: 1 },
  start: { alignSelf: "flex-start" },
  small: { paddingHorizontal: tokens.space[2], paddingVertical: tokens.space[0] },
});

const useToneStyles = makeStyles((c) =>
  StyleSheet.create({
    info: { backgroundColor: c.primarySoft },
    success: { backgroundColor: c.successSoft },
    warning: { backgroundColor: c.warningSoft },
    danger: { backgroundColor: c.dangerSoft },
  }),
);
