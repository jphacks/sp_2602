// tmp/animations/rnweb/whiteboard/components/AppText.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 文字の部品（ホワイトボード）。props・variant・tone はアプリの AppText（src/components/AppText.tsx）と同じ（足したものは下の2つだけ）。
// 変わるのは書体だけ。書体はどの道具（テーマ）でも同じ BIZ UDPゴシック1つ（theme/tool.ts の fonts。D-135）。強弱は太さと大きさで付ける:
//   見出し（headline・title・message）＝ Bold（700）
//   大きな数字（display・ring）＝ Bold（700）を大きく
//   本文・日付・ボタン・タブ（body・small・label・caption・micro）＝ Regular（400）。strong で Bold（700）
//   display は Figma 子01 の「46」に合わせて 56（tokens の 48 より大きい。子ども用の数字の大きさ）
// アプリにない足したもの（アプリの画面は使わないので、入れ替えても今までどおり動く）:
//   variant="message" … QR・連携・空の画面の題名（Bold 20。MessageView・StateView が使う。Figma 子13〜子19・共01〜共03）
//   phrases           … 「、」「。」の後ろで区切ったまとまりを並べ、1行に入らないときだけ「、」の後ろで次の行へ送る（手の改行なし。
//                        components/child/PhraseText.tsx と同じ考え方）。まとまりが1行より長いときは、その中で text-wrap の決まりで折り返す。
//                        文字が1つの Text でなくなる（まとまりごとの Text を並べた箱になる）ので、ほかの文字の中に入れて使わない。
//                        Banner・MessageView・StateView・Dialog の本文で使う（Figma は「、」の後ろで折り返している所が多い）
//   <AppText variant="title">今日の使用量</AppText>  <AppText variant="small" tone="muted" center phrases>{body}</AppText>
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, type TextProps, View } from "react-native";
import { keepTailTogether, plainTextOf } from "@/components/text-wrap";
import { Text } from "@/kids/lib/text";
import { makeStyles } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { splitPhrases } from "./child/PhraseText";

export type TextVariant =
  | "display"
  | "ring"
  | "headline"
  | "title"
  | "message"
  | "body"
  | "small"
  | "label"
  | "caption"
  | "micro";
export type TextTone =
  | "default"
  | "muted"
  | "primary"
  | "onPrimary"
  | "onPrimarySoft"
  | "danger"
  | "warning"
  | "success";

type Props = Omit<TextProps, "style"> & {
  variant?: TextVariant;
  tone?: TextTone;
  center?: boolean;
  strong?: boolean; // 太字にする（本文の大きさのときだけ。見出し・数字ははじめから太字）
  phrases?: boolean; // 「、」「。」の後ろのまとまりで折り返す（上の説明）
  children: ReactNode;
};

// 見出しの variant（はじめから太字。strong を見ない）
const HEADING: ReadonlySet<TextVariant> = new Set(["headline", "title", "message"]);
const NUMBER: ReadonlySet<TextVariant> = new Set(["display", "ring"]);

export function AppText({
  variant = "body",
  tone = "default",
  center = false,
  strong = false,
  phrases = false,
  children,
  ...rest
}: Props) {
  const tones = useTones();
  const styles = variantStyles;
  // 値を差し込んだ文（文字と数の配列）も1つの文字列にしてから印を入れる
  const plain = plainTextOf(children);
  const bold = strong && !HEADING.has(variant) && !NUMBER.has(variant);
  const style = [styles[variant], tones[tone], center && styles.center, bold && styles.strong];
  const parts = phrases && plain != null ? splitPhrases(plain) : null;
  if (parts && parts.length > 1) {
    // 読み上げは文全体を1つにする（まとまりごとに区切って読まない）
    return (
      <View
        {...(rest as object)}
        style={[box.row, center && box.center]}
        accessible
        accessibilityLabel={rest.accessibilityLabel ?? plain ?? undefined}
      >
        {parts.map((p, i) => {
          // 文の中の改行（\n）は、そこで必ず次の行へ（幅いっぱいの見えない区切りを置いてから、改行を取ったまとまりを並べる）
          const lines = p.split("\n");
          return lines.map((line, j) => [
            j > 0 ? <View key={`b${i}-${j}`} style={box.break} /> : null,
            line ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同じ文の中の順番は変わらない
              <Text key={`t${i}-${j}`} style={[style, box.part]}>
                {keepTailTogether(line)}
              </Text>
            ) : null,
          ]);
        })}
      </View>
    );
  }
  return (
    <Text {...rest} style={style}>
      {/* 言葉の途中や、文の終わりの1〜2文字だけで次の行に落とさない（text-wrap.ts） */}
      {plain != null ? keepTailTogether(plain) : children}
    </Text>
  );
}

const box = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap" },
  center: { justifyContent: "center" },
  // まとまりが1行より長いときは、箱の幅で折り返す
  part: { flexShrink: 1 },
  break: { width: "100%", height: 0 },
});

// 書体はどの道具でも同じ（theme/tool.ts の fonts）。大きさは tokens のまま
const variantStyles = StyleSheet.create({
  // 大きい数字（子01 の「46」）。Bold 56
  display: { ...fonts.bold, fontSize: 56, lineHeight: 58 },
  // 円の中の数字（子02）
  ring: { ...fonts.bold, fontSize: tokens.font.ring, lineHeight: tokens.lineHeight.ring },
  // 上のバーの題名・ダイアログの題名（Bold 22）
  headline: { ...fonts.bold, fontSize: tokens.font.xl, lineHeight: tokens.lineHeight.xl },
  // カードの見出し（Bold 18）
  title: { ...fonts.bold, fontSize: tokens.font.lg, lineHeight: tokens.lineHeight.lg },
  // QR・連携・空の画面の題名（Bold 20）
  message: { ...fonts.bold, fontSize: 20, lineHeight: 28 },
  body: { ...fonts.body, fontSize: tokens.font.base, lineHeight: tokens.lineHeight.base },
  // 小さめの本文（ダイアログの本文・注意書き・日付。14）
  small: { ...fonts.body, fontSize: tokens.font.sm, lineHeight: 21 },
  // ボタン・値の文字（14）
  label: { ...fonts.body, fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm },
  caption: { ...fonts.body, fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
  // グラフの日付（「10/12」）
  micro: { ...fonts.body, fontSize: tokens.font.xxs, lineHeight: tokens.lineHeight.xxs },
  center: { textAlign: "center" },
  strong: { fontWeight: fonts.bold.fontWeight },
});

const useTones = makeStyles((c) =>
  StyleSheet.create({
    default: { color: c.text },
    muted: { color: c.muted },
    primary: { color: c.primary },
    onPrimary: { color: c.onPrimary },
    onPrimarySoft: { color: c.onPrimarySoft },
    danger: { color: c.danger },
    warning: { color: c.warning },
    success: { color: c.success },
  }),
);
