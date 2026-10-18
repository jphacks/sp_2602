// tmp/animations/rnweb/whiteboard/components/child/UsageSummaryCard.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 「今日の使用量」のカード（子01 系・子11）。export と props はアプリの UsageSummaryCard（src/components/child/UsageSummaryCard.tsx）と同じ。
// 形（Figma 子01・子01-A〜H・子11。3つのモードで同じ並び）:
//   上に「使った時間の色」の insights のアイコン 20＋見出し「今日の使用量」（見出しの書体）。
//   大きい数字「46」（大きな数字の書体・使った時間の数字の色）＋「％ 使いました」（本文 16）。その下に使った割合の線（道具の UsedBar）。
//   右下に「詳しく見る ›」（線の小さい丸いボタン。onDetail があるときだけ。子11 にはない）。
//   割合が出せない状態（制限なし・未設定・権限なし・取得不可）は、数字の代わりに UsageMessage（0% と出さない）。
// 色・線・書体は今の道具（useTool）のものだけを使う（「ホワイトボードだから」の分岐を書かない）。
// 動き（src/lib/motion.ts の決まり。アプリと同じ）:
//   - 割合が最初に分かったとき、数字が 0 から数え上がり、線も同じ値（同じ Animated.Value）で 0 から伸びる（ずれない）。
//     始まりはカードが見えてから values.timing.barDelay（ホワイトボード 280ms）、長さは values.timing.barDuration（700ms）
//   - 30 秒ごとの取り直しで値が変わったら、今の位置から新しい値へ（useAnimatedNumber の update）
//   - 割合が出せない間は数字も線も出さない（0 から数えない）。「動きを減らす」がオンなら最初から値を出す
//   - 道具によっては、数え終わったら数字を強調する（役目 NumberMark。ノートの緑の蛍光ペン。ホワイトボードはなし）
//   - 読み込み中 → 割合・案内に変わるときは、短く透明から出す（FadeIn）
import { tokens } from "@contracts/tokens";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { UsageMessage as Message, UsageView } from "@/components/child/child-view";
import { AppText, Button, Card, FadeIn, Icon, ProgressBar, useRevealDelay } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { useColors } from "@/lib/theme";
import { fonts } from "../../theme/tool";
import { Measured, useTool } from "../../tools";
import { UsageMessage } from "./UsageMessage";

type Props = {
  view: UsageView;
  onDetail?: () => void;
  onAction: (kind: NonNullable<Message["action"]>["kind"]) => void;
};

export function UsageSummaryCard({ view, onDetail, onAction }: Props) {
  const c = useColors();
  const { values, NumberMark, Spinner } = useTool();
  const text = numberStyles;
  const target = view.kind === "percent" ? view.percent : null;
  // カードが見えてから、道具の「引き始め」の時間だけ待って伸ばす（透けているうちに伸び終わらないように）
  const delay = useRevealDelay(target != null, values.timing.barDelay ?? motion.duration.short);
  const { value, display, reduced } = useAnimatedNumber(target, {
    duration: values.timing.barDuration ?? motion.duration.fill,
    delay,
  });
  // 前に出していた数字（案内の文から割合に戻った最初の1コマで「0」を出さないため）
  const lastShown = useRef<number | null>(null);
  useEffect(() => {
    if (display != null) lastShown.current = display;
  }, [display]);
  // 動き始める前（待っている間）は 0 から。「動きを減らす」がオンなら最初から値を出す
  const shown = display ?? (reduced ? target : lastShown.current) ?? 0;
  const counted = target != null && display === Math.round(target);

  return (
    <Card>
      <View style={styles.heading}>
        <Icon name="insights" size={tokens.size.iconSmall} color={values.colors.usedText} />
        <Text style={[text.title, { color: c.text }]} accessibilityRole="header">
          今日の使用量
        </Text>
      </View>
      {view.kind === "loading" && (
        <View style={styles.loading}>
          <Spinner size={tokens.size.icon} />
          <AppText tone="muted">読み込んでいます…</AppText>
        </View>
      )}
      {view.kind === "percent" && (
        <FadeIn key="percent" style={styles.block}>
          {/* 1つのまとまりとして読み上げる（数え上げの途中の数字ではなく、ラベルの最後の値を読む） */}
          <View style={styles.number} accessible accessibilityLabel={`今日は ${view.percent}パーセント 使いました`}>
            <Measured
              style={styles.numberBox}
              mark={(w, h) => (NumberMark ? <NumberMark w={w} h={h} start={counted} /> : null)}
            >
              <Text style={[text.percent, { color: values.colors.usedText }]}>{shown}</Text>
            </Measured>
            <View style={styles.unit}>
              <AppText>％ 使いました</AppText>
            </View>
          </View>
          <ProgressBar percent={view.percent} progress={value} accessibilityLabel="今日の使用量" />
        </FadeIn>
      )}
      {view.kind === "message" && (
        <FadeIn key={view.reason}>
          <UsageMessage message={view.message} onAction={onAction} />
        </FadeIn>
      )}
      {onDetail && (
        <View style={styles.detail}>
          <Button variant="soft" label="詳しく見る" trailingIcon="chevron_right" onPress={onDetail} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  // 読み込み中も、割合が出たとき（数字＋線）と同じ高さにしておく。出たときに下のカードがガタッと動かないように
  loading: { flexDirection: "row", alignItems: "center", gap: tokens.space[3], minHeight: 58 + 6 + 24 },
  // 数字と線の間（Figma 子01: 数字の下から線まで 25）
  block: { gap: 11 },
  // 数字と「％ 使いました」は字の下の線をそろえる（大きさの違う2つの文字。行の箱の下から、それぞれの字の下の線までの差を下の余白で埋める。
  //   Android の書体の高さ（hhea）で: 数字 56/58 は箱の下から 7.7、本文 16/24 は 5.9 の所に下の線がある → 本文を 2 上げる）
  number: { flexDirection: "row", alignItems: "flex-end", gap: tokens.space[2] },
  numberBox: { alignSelf: "flex-end" },
  unit: { marginBottom: 2 },
  // Figma 子01: ボタンの見た目の下端からカードの枠まで 17（押せる高さ 44 の下の空きの分だけ詰める）
  detail: { marginBottom: -6 },
});

// 大きい数字（太字 56。Figma 子01 の「46」の大きさ）。数え上げの間に幅が変わって「％ 使いました」が揺れないよう、数字の幅をそろえる
const numberStyles = StyleSheet.create({
  // 見出し（太字。Figma 子01 は 17。AppText の title 18/26 より小さく詰める）
  title: { ...fonts.bold, fontSize: 17, lineHeight: 22 },
  percent: { ...fonts.bold, fontSize: 56, lineHeight: 58, fontVariant: ["tabular-nums"] },
});
