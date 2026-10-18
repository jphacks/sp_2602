// tmp/animations/rnweb/whiteboard/components/Banner.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 帯の案内（ホワイトボード）。props はアプリの Banner（src/components/Banner.tsx）と同じ。
// 形（Figma 子03・子08・子01-C・子05-B・kids-design-round2.md 5 章）:
//   - 地は塗らず、手で4辺を引いた枠。左にアイコン 24、右に文（BIZ UDPゴシック 14）。補足（hint）があるときは文を太字に、補足は 12 の muted
//   - 種類（info・warning・danger・success）は色で分けない（赤・黄を使わない）。違いはアイコンだけ（info＝info、warning＝warning・cloud_off、danger＝error）
//   - action（「読み込み直す」などの文字だけのボタン）は文の下の右端に、少し小さい 14 の太字で
//   - 上限に達した帯（icon="block"。子11・子01-D）だけは箱にしない: ボードに「一文として書いた」形で、文の下に緑マーカーの下線を引く
//     （時間を使い切った、の意味。kids-design-round2.md 2-3。下線は出てから 300ms 待って 420ms）
// 後から出たときに高さを広げて入るのは、呼ぶ側の Reveal（アプリのまま）。
//   <Banner icon="edit" message="テストの名前と期間を入れてください" />
//   <Banner tone="warning" icon="cloud_off" message="最新でない可能性があります" hint="…" />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { keepTailTogether } from "@/components/text-wrap";
import { Text } from "@/kids/lib/text";
import { useColors } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { seedOf, useSize, useTool } from "../tools";
import { AppText } from "./AppText";
import { ButtonContext } from "./Button";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "warning" | "danger" | "success";

type Props = { message: string; hint?: string; icon?: IconName; tone?: Tone; action?: ReactNode };

const defaultIcon: Record<Tone, IconName> = {
  info: "info",
  warning: "warning",
  danger: "error",
  success: "check_circle",
};

export function Banner({ message, hint, icon, tone = "info", action }: Props) {
  const c = useColors();
  const { Frame, values } = useTool();
  const name = icon ?? defaultIcon[tone];
  const a11y = {
    accessibilityRole: tone === "danger" ? ("alert" as const) : undefined,
    accessibilityLiveRegion: "polite" as const,
  };
  if (name === "block") return <ReachedBanner message={message} hint={hint} action={action} {...a11y} />;
  return (
    <Frame
      seed={seedOf(message, 7)}
      kind="banner"
      style={[
        styles.box,
        hint ? styles.boxHint : null,
        { borderRadius: values.frame.radius },
        action ? styles.boxAction : null,
      ]}
      {...a11y}
    >
      {/* 「読み込み直す」などのボタンがある帯は背が高いので、アイコンは1行目の高さにそろえる（Figma 子05-B） */}
      <View style={action ? styles.iconTop : null}>
        <Icon name={name} color={c.text} />
      </View>
      <View style={styles.text}>
        {/* 文はふつうの折り返し（Figma 子08・子09 は「ログインして、テストに向けた計画を／始めよう」と1行目を埋める）。
            補足だけ「、」の後ろで折り返す（Figma 子14-B「つながったら、／読み取られたかを…」） */}
        <AppText variant="small" strong={!!hint}>
          {message}
        </AppText>
        {hint ? (
          <AppText variant="caption" tone="muted" phrases>
            {hint}
          </AppText>
        ) : null}
        {action ? <ButtonContext.Provider value={{ compact: true }}>{action}</ButtonContext.Provider> : null}
      </View>
    </Frame>
  );
}

// 上限に達した日の帯。箱にせず、禁止のアイコン＋太字の一文、その下に使った時間の道具の下線（文の幅の 92%・少しゆるく波打つ1本）
function ReachedBanner({
  message,
  hint,
  action,
  ...a11y
}: {
  message: string;
  hint?: string;
  action?: ReactNode;
  accessibilityRole?: "alert";
  accessibilityLiveRegion: "polite";
}) {
  const c = useColors();
  const { Underline } = useTool();
  const text = reachedTextStyles;
  const [{ w }, onLayout] = useSize();
  return (
    <View style={styles.reached} {...a11y}>
      <Icon name="block" color={c.text} />
      <View style={styles.text} onLayout={onLayout}>
        {/* Figma 子11: BIZ UDPゴシック Bold 15・行の高さ 23（AppText の大きさにない形なので Text で書く） */}
        <Text style={[text.reachedText, { color: c.text }]}>{keepTailTogether(message)}</Text>
        {w > 0 && (
          <View style={styles.reachedLine}>
            <Underline width={w * 0.92 + 4} active kind="reached" />
          </View>
        )}
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma 子03: 高さ 56（1行）・左右 16・アイコンと文の間 12。2行（子08）は 76
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    // Figma 子01-C・子08-B・子14-B・入02: 1行の帯は高さ 55、補足つきは 67
    paddingVertical: 15.5,
  },
  boxHint: { paddingVertical: 14 },
  boxAction: { alignItems: "flex-start", paddingTop: 12, paddingBottom: 2 },
  iconTop: { marginTop: -1 },
  text: { flex: 1, gap: 2 },
  reached: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: tokens.space[1],
    paddingHorizontal: tokens.space[1],
  },
  reachedLine: { marginTop: -1, marginLeft: -2 },
});

const reachedTextStyles = StyleSheet.create({
  reachedText: { ...fonts.bold, fontSize: 15, lineHeight: 23 },
});
