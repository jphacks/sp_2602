// tmp/animations/rnweb/whiteboard/components/schedule/PeriodRow.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 一覧の1行（子10・子10-C・親05）。props と文言はアプリの PeriodRow と同じ（文言は logic.ts の periodRowText）。
// 形（Figma 子10・子10-C）: 手描きの枠の行（高さ 66）に、左からカレンダーのアイコン（24 の箱。形は 20）・テスト名（太字 16）・日付（太字 16）・
//   期間中／終了（小さく muted）・›。名前と日付は同じ行に並べ、入らなければ折り返す。
//   - 期間（〜）は「開始日」と「〜終了日」の2つに分けて並べる。1日だけのテストは Figma のとおり1行に入り、
//     期間のテストは「数学 10月28日（水）」の次の行に「〜10月29日（木） 期間中」が続く（文言はアプリの1つの文のまま。分けて置くだけ）
//   - 次のテスト（一覧の一番上の期間中・これからのテスト。PeriodListScreen が MarkedPeriod で伝える）だけ、開始日に印を付ける
//     （道具の TestMark。ホワイトボード＝赤の下線＋ちょん2本。日付の文字の色は道具の testText。ホームの NextTestCard と同じ決まり）。ホームの「次のテスト」と同じく開始日「10月28日（水）」全体に付ける。
//     印は行が見えてから（Reveal）、道具の時間（markAt）だけ後に引き始める。印は1画面に1つまで
//   - 終わったテスト（子10-C の国語）は、行の中を全部 muted にする（枠はそのまま）
import { tokens } from "@contracts/tokens";
import { createContext, useContext } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, useRevealDelay } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { makeStyles, useColors } from "@/lib/theme";
import { Measured, makeToolStyles, seedOf, useTool } from "../../tools";
import { type Period, periodPhase, periodRowText } from "./logic";

type Props = { period: Period; today: string; showCreator?: boolean; onPress: (p: Period) => void };

// 印を付ける行の id（一覧の画面が決める。props を変えずに伝えるため）。null なら印を付けない
export const MarkedPeriod = createContext<string | null>(null);

// 期間の文言「A〜B」を、開始日と「〜B」に分ける（文言そのものは変えない。1日だけなら開始日だけ）
function splitRange(range: string): [string, string] {
  const i = range.indexOf("〜");
  return i < 0 ? [range, ""] : [range.slice(0, i), range.slice(i)];
}

export function PeriodRow({ period, today, showCreator, onPress }: Props) {
  const styles = useStyles();
  const text = useTextStyles();
  const c = useColors();
  const { Frame, TestMark, values } = useTool();
  const t = periodRowText(period, today, { showCreator });
  const marked = useContext(MarkedPeriod) === period.id;
  const past = periodPhase(period, today) === "past";
  const tone = { color: past ? c.muted : c.text };
  const [start, rest] = splitRange(t.subtitle);
  // 行が見え始めてから markAt（ホワイトボード 950ms）後に下線を引き始める（Reveal の外なら開いてから）
  const markDelay = useRevealDelay(true, values.timing.markAt ?? 950);
  // 印を付けた日付の文字の色は道具の役目の色 testText（ホームの「次のテスト」と同じ。ない道具は ink）
  const date = <Text style={[text.date, marked ? { color: values.colors.testText ?? c.text } : tone]}>{start}</Text>;

  return (
    <Pressable onPress={() => onPress(period)} accessibilityRole="button" accessibilityLabel={t.accessibilityLabel}>
      {({ pressed }) => (
        <Frame
          seed={seedOf(`${period.name}${period.startDate}`, 19)}
          kind="row"
          tone={marked ? "test" : undefined}
          style={[styles.item, { borderRadius: values.frame.radius }, pressed && styles.pressed]}
        >
          <Icon name="event" size={tokens.size.icon} color={tone.color} />
          <View style={styles.flow}>
            <Text style={[text.name, tone]}>{t.title}</Text>
            {marked ? (
              // ちょんは日付の右にはみ出して描かれるので、その分だけ右を空ける
              <Measured style={styles.markRoom} mark={(w, h) => <TestMark w={w} h={h} start delay={markDelay} />}>
                {date}
              </Measured>
            ) : (
              date
            )}
            {rest ? <Text style={[text.date, tone]}>{rest}</Text> : null}
            {t.value ? <Text style={[text.value, { color: c.muted }]}>{t.value}</Text> : null}
          </View>
          <Icon name="chevron_right" color={tone.color} />
        </Frame>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    // Figma 子10: 行の高さ 66、アイコンの形は枠の左から 18（24 の箱は 16）、› は右から 16。アイコンの形と名前の間 12
    item: {
      minHeight: tokens.size.listItem,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 16,
      paddingRight: tokens.space[4],
      paddingVertical: tokens.space[3],
    },
    // 名前・日付・期間中を1つの流れに並べ、入らなければ次の行へ（文字の下の線をそろえる）
    flow: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: tokens.space[3],
      rowGap: 6, // 1行目の日付の下線と、2行目の文字がくっつかないように
    },
    markRoom: { marginRight: tokens.space[2] },
    pressed: { backgroundColor: c.surfaceDim },
  }),
);

// 書体は今の道具の本文の書体（名前・日付は太字 16、期間中／終了は 12）。Figma 子10-C の文字の大きさ
const useTextStyles = makeToolStyles(({ fonts }) =>
  StyleSheet.create({
    name: {
      fontFamily: fonts.body,
      fontWeight: "700",
      fontSize: tokens.font.base,
      lineHeight: tokens.lineHeight.base,
      flexShrink: 1,
    },
    date: {
      fontFamily: fonts.body,
      fontWeight: "700",
      fontSize: tokens.font.base,
      lineHeight: tokens.lineHeight.base,
      flexShrink: 1,
    },
    value: { fontFamily: fonts.body, fontWeight: "400", fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
  }),
);
