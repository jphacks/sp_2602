// tmp/animations/rnweb/whiteboard/components/child/NextTestCard.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 「次のテスト」のカード（子01 系・子11）。export と props はアプリの NextTestCard（src/components/child/NextTestCard.tsx）と同じ。
// 形（Figma 子01・子01-F・子01-H・子11。3つのモードで同じ並び）:
//   左にカレンダー（event）32、右に「次のテスト」（見出しの書体）→ 日付「10月28日（水）」＋テスト名 →「あと 13 日」（数字は大きな数字の書体）。
//   日付は「（水）」までを1つの文字にして、その全体に道具のテストの印（役目 TestMark。ホワイトボード＝赤の下線＋ちょんちょん）。
//   印は1画面に1つ（この画面で一番大事なのが次のテストの日付）。「予定なし」「--」には印を付けない（分からないものを強調しない）。
//   文字の色は道具の役目の色: 日付＝values.colors.testText・残りの日数の数字＝values.colors.testCount（ない道具は ink）。
//   （Figma: ホワイトボードは日付が赤・数字は ink、ノートは日付が ink・数字が赤、黒板はどちらもチョークの白）
// emphasis（テストが近い・期間中。child-view.ts の nextTestEmphasis）のときは「強い印」（twice。ホワイトボード＝下線2本＋ちょん3本）。
//   アプリのカードのまわりを光らせる動きは、強い印に置き換えた（光は primary の色の板で、ボードの上では黒い影に見えるため。Figma にない）。
// 動き: カードが見えたら印を引き始める（下線・ちょんの時間は道具が決める。ホワイトボードは 950ms から）。
//   「動きを減らす」がオンなら、道具が最初から引いた形を出す。
import { tokens } from "@contracts/tokens";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { NextTestView } from "@/components/child/child-view";
import { keepTailTogether } from "@/components/text-wrap";
import { AppText, Card, Icon, useRevealDelay } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { useColors } from "@/lib/theme";
import { fonts } from "../../theme/tool";
import { Measured, useTool } from "../../tools";

type Props = { view: NextTestView; emphasis?: boolean };

// 「10月28日（水） 数学」→ 日付「10月28日（水）」とテスト名「数学」（曜日のかっこの閉じまでが日付）
function splitHeadline(headline: string): { date: string; rest: string } {
  const end = headline.indexOf("）");
  if (end < 0) return { date: headline, rest: "" };
  return { date: headline.slice(0, end + 1), rest: headline.slice(end + 1).trim() };
}

export function NextTestCard({ view, emphasis = false }: Props) {
  const c = useColors();
  const { TestMark, Spinner, values } = useTool();
  const text = textStyles;
  const start = useMarkStart(view.kind === "test");
  const dateColor = values.colors.testText ?? c.text;
  const countColor = values.colors.testCount ?? c.text;
  return (
    <Card tone="soft" frameTone="test">
      <View style={styles.row}>
        <Icon name="event" size={tokens.size.iconLarge} color={c.text} />
        <View style={styles.text}>
          <Text style={[text.label, { color: c.text }]}>次のテスト</Text>
          {view.kind === "loading" ? (
            <View style={styles.loading}>
              <Spinner size={tokens.size.icon} accessibilityLabel="次のテストを読み込んでいます" />
            </View>
          ) : view.kind === "test" ? (
            <>
              <View style={[styles.dateRow, emphasis && styles.dateRowStrong]}>
                {(() => {
                  const { date, rest } = splitHeadline(view.headline);
                  return (
                    <>
                      <Measured mark={(w, h) => <TestMark w={w} h={h} start={start} twice={emphasis} />}>
                        <Text style={[text.date, { color: dateColor }]}>{date}</Text>
                      </Measured>
                      {!!rest && <Text style={[text.rest, { color: c.text }]}>{keepTailTogether(rest)}</Text>}
                    </>
                  );
                })()}
              </View>
              <Detail detail={view.detail} color={c.text} countColor={countColor} />
            </>
          ) : (
            // 予定なし・取得できない（「--」）: 印を付けない大きい字＋本文
            <>
              <View style={styles.dateRow}>
                <Text style={[text.none, { color: c.text }]}>{view.headline}</Text>
              </View>
              <AppText variant="small">{view.detail}</AppText>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

// 「あと13日」は数字を大きな数字の書体にする（文言はそのまま。読み上げも「あと13日」）。
// 「テスト中（10月29日（木）まで）」は「テスト中」と「（…まで）」の2つに分けて並べ、入らなければ「（…まで）」ごと次の行へ
// （Figma 子01-H。かっこの途中の「まで）」だけが次の行に落ちないように）。それ以外はそのまま
function Detail({ detail, color, countColor }: { detail: string; color: string; countColor: string }) {
  const text = textStyles;
  const m = detail.match(/^あと(\d+)日$/);
  const during = detail.match(/^(テスト中)(（.+）)$/);
  if (during)
    return (
      <View style={styles.duringRow} accessible accessibilityLabel={detail}>
        <Text style={[text.remain, { color }]}>{during[1]}</Text>
        <Text style={[text.remain, { color }]}>{during[2]}</Text>
      </View>
    );
  if (!m) return <Text style={[text.remain, { color }]}>{keepTailTogether(detail)}</Text>;
  return (
    <View style={styles.remainRow} accessible accessibilityLabel={detail}>
      <Text style={[text.remain, { color }]}>あと</Text>
      <Text style={[text.remainNum, { color: countColor }]}>{m[1]}</Text>
      <Text style={[text.remain, { color }]}>日</Text>
    </View>
  );
}

// 印を引き始めるか。カードが見え始めたら true（Reveal の外ではすぐ）。日付が出ていないときは false
function useMarkStart(known: boolean): boolean {
  const wait = useRevealDelay(known, 0);
  const [start, setStart] = useState(false);
  useEffect(() => {
    if (!known) {
      setStart(false);
      return;
    }
    if (wait <= 0) {
      setStart(true);
      return;
    }
    const t = setTimeout(() => setStart(true), wait);
    return () => clearTimeout(t);
  }, [known, wait]);
  return start;
}

const styles = StyleSheet.create({
  // Figma 子01: カードの中の上は 16・下は 12（Card の余白 20 から詰める）
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[4], marginTop: -4, marginBottom: -8 },
  text: { flex: 1 },
  loading: { paddingVertical: tokens.space[2] },
  // 日付は少し右から（Figma 子01: 「次のテスト」より 7 右）。テスト名は印のちょんの先から（間 24）。長ければ次の行へ
  dateRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: tokens.space[6],
    paddingTop: 2,
    paddingLeft: 7,
  },
  // 1行を短めに（Figma 子01-H の文の箱の幅。ほかのカードの本文と同じくらい）
  duringRow: { flexDirection: "row", flexWrap: "wrap", maxWidth: 204, marginTop: -2 },
  // 強い印（ちょん3本）のときは、テスト名をもう少し右から
  dateRowStrong: { columnGap: 28 },
  remainRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: -2 },
});

// 「次のテスト」＝太字 15。日付＝太字 21。テスト名 18。「あと 13 日」＝18 と太字の数字 30（Figma 子01）
const textStyles = StyleSheet.create({
  label: { ...fonts.bold, fontSize: 15, lineHeight: 20 },
  date: { ...fonts.bold, fontSize: 21, lineHeight: 28 },
  rest: { ...fonts.body, fontSize: 18, lineHeight: 24 },
  none: { ...fonts.bold, fontSize: 21, lineHeight: 28 },
  remain: { ...fonts.body, fontSize: 18, lineHeight: 28 },
  remainNum: { ...fonts.bold, fontSize: 30, lineHeight: 32 },
});
