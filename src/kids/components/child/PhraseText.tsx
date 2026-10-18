// tmp/animations/rnweb/whiteboard/components/child/PhraseText.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 文を「、」「。」の後ろで区切ったまとまりごとに並べる文字（ホーム系のカードの本文・説明に使う。アプリにはまだない助けの部品）。
// なぜ: Figma 子01-A・子01-F・子01-B の本文は、2行になるとき「しばらくしてから、／もう一度ためしてください」のように「、」の後で折り返す。
//   手で改行（\n）を入れると、幅や文字の大きさが違う端末で変な所で切れる（text-wrap.ts の決まり）ので、改行は入れない。
//   代わりに、まとまりを横に並べて折り返す箱（flexWrap）に入れる: 1行に入れば今までどおり1行、入らなければ次のまとまりから次の行へ。
//   1つのまとまりが1行に入らないときは、その中で text-wrap の決まり（文節の切れ目）で折り返す。
// 読み上げは文全体を1つにする（まとまりごとに区切って読まない）。
//   <PhraseText style={[text.body, { color: c.muted }]}>{message.body}</PhraseText>
import { type StyleProp, StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import { keepTailTogether } from "@/components/text-wrap";
import { Text } from "@/kids/lib/text";

// 「、」「。」の後ろで区切る（区切りの文字は前のまとまりに残す）
export function splitPhrases(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (ch === "、" || ch === "。") {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

type Props = { children: string; style?: StyleProp<TextStyle>; boxStyle?: StyleProp<ViewStyle> };

export function PhraseText({ children, style, boxStyle }: Props) {
  const parts = splitPhrases(children);
  if (parts.length <= 1)
    return <Text style={[style, boxStyle as StyleProp<TextStyle>]}>{keepTailTogether(children)}</Text>;
  return (
    <View style={[styles.row, boxStyle]} accessible accessibilityLabel={children}>
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 同じ文の中の順番は変わらない
        <Text key={i} style={[style, styles.part]}>
          {keepTailTogether(p)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap" },
  // まとまりが1行より長いときは、箱の幅で折り返す
  part: { flexShrink: 1 },
});
