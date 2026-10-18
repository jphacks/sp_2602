// tmp/animations/rnweb/whiteboard/components/Card.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// カード（ホワイトボード）。props はアプリの Card（src/components/Card.tsx）と同じ。
// ボードに直接書く: 地は塗らず、今の道具の手描きの枠（useTool().Frame。ホワイトボードは黒のマーカーで4辺を引いた線・太さ 2.3・角 8・揺れ 0.6）。
// tone="soft"（アプリでは薄い青の地。次のテストのカードなど）も、ホワイトボードでは地を塗らない同じ枠（Figma 子01 の次のテスト）。
// 枠の揺れはカードごとに決まった形（画面の中の置き場所から種を作る。開き直しても同じ形）。
//   <Card><AppText variant="title">今日の使用量</AppText>…</Card>
import { tokens } from "@contracts/tokens";
import { type ReactNode, useId } from "react";
import { StyleSheet } from "react-native";
import { seedOf, useTool } from "../tools";

// frameTone: テストの枠（次のテストのカード）。黒板＝ピンクのチョークの枠。アプリにない足したもの（省略可）
type Props = { tone?: "default" | "soft"; frameTone?: "test"; children: ReactNode };

export function Card({ tone = "default", frameTone, children }: Props) {
  const seed = seedOf(useId(), tone === "soft" ? 11 : 3);
  const { Frame, values } = useTool();
  return (
    <Frame seed={seed} kind="card" tone={frameTone} style={[styles.card, { borderRadius: values.frame.radius }]}>
      {children}
    </Frame>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: tokens.layout.cardPadding,
    gap: tokens.space[3],
  },
});
