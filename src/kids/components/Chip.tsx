// tmp/animations/rnweb/whiteboard/components/Chip.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 小さい札（ホワイトボード）。props はアプリの Chip（src/components/Chip.tsx）と同じ。
// 形（Figma 子02「ちょうどいいペース！」・子02-B「ゆっくり使おう」・子14「あと 9分41秒で…」）:
//   地は塗らず、手で4辺を引いた枠（角 8）。左にアイコン 20、右に文（BIZ UDPゴシック 15・高さ 40。Figma 子02）。
//   色で分けない（赤・黄を使わない）。ただし success（ちょうどいいペース）のアイコンだけ、使った時間の緑の数字の色（Figma 子02）
//   small（行の中の小さい札「反映待ち」）は 12 の文字・枠は細く
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { keepTailTogether } from "@/components/text-wrap";
import { Text } from "@/kids/lib/text";
import { useColors } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { seedOf, useTool } from "../tools";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
type Props = { label: string; icon?: IconName; tone?: Tone; align?: "center" | "start"; small?: boolean };

export function Chip({ label, icon, tone = "info", align = "center", small = false }: Props) {
  const c = useColors();
  const { Frame, values } = useTool();
  const text = chipTextStyles;
  const iconColor = tone === "success" ? values.colors.usedText : c.text;
  return (
    <Frame
      seed={seedOf(label, 5)}
      kind="chip"
      size={small ? "small" : "normal"}
      style={[styles.chip, align === "start" && styles.start, small && styles.small]}
    >
      {icon && <Icon name={icon} size={tokens.size.iconSmall} color={iconColor} />}
      {/* 長い文は、文字を大きくした端末で札が画面の外へはみ出さないよう、アイコンの横で折り返す */}
      <View style={styles.label}>
        {small ? (
          <AppText variant="caption">{label}</AppText>
        ) : (
          <Text style={[text.label, { color: c.text }]}>{keepTailTogether(label)}</Text>
        )}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: tokens.space[2],
    paddingHorizontal: 16,
    paddingVertical: 9, // Figma 子02: 高さ 40
  },
  label: { flexShrink: 1 },
  start: { alignSelf: "flex-start" },
  small: { paddingHorizontal: tokens.space[2], paddingVertical: 2 },
});

// 札の文字（本文の書体 15）
const chipTextStyles = StyleSheet.create({ label: { ...fonts.body, fontSize: 15, lineHeight: 22 } });
