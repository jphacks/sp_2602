// tmp/animations/rnweb/whiteboard/components/IconBadge.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 大きいアイコンの丸（ホワイトボード・96×96。QR・連携の画面の上、空・エラー・成功の画面）。props はアプリの IconBadge と同じ。
// 形（Figma 子15・子16・子19・子10-B）: 地は塗らず、ink の細い線（1px）の丸。中に ink のアイコン 48。
// tone・iconTone で色を変えない（赤・緑・黄を使わない。エラーも成功もアイコンの形で伝える）。
// 成功（check）は、出てから 120ms 後に黒マーカーでチェックを 320ms で引く（子19）。
// エラー（error）は Figma 子16・共01 のとおり三角の warning で描く（丸に「！」は帯の danger だけ）。
//   <IconBadge icon="check" tone="success" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { useColors } from "@/lib/theme";
import { useTool } from "../tools";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
type Props = { icon: IconName; tone?: Tone; iconTone?: Tone };

export function IconBadge({ icon, tone: _tone, iconTone: _iconTone }: Props) {
  const c = useColors();
  const { Check, BadgeFill, values } = useTool();
  return (
    <View style={[styles.badge, { borderColor: c.text, borderWidth: values.stroke.badge }]}>
      {/* 道具によっては丸の地を塗る（黒板＝一段明るい黒板＋粒）。ホワイトボードは塗らない */}
      {BadgeFill && <BadgeFill size={tokens.size.iconBadge} />}
      {/* 丸の中なので、check_circle もチェックだけを引く（丸が二重にならないように。Figma 子19） */}
      {icon === "check" || icon === "check_circle" ? (
        <Check size={tokens.size.iconBadgeGlyph} start />
      ) : (
        <Icon name={icon === "error" ? "warning" : icon} size={tokens.size.iconBadgeGlyph} color={c.text} />
      )}
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
