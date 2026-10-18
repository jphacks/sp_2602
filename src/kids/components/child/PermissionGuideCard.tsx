// tmp/animations/rnweb/whiteboard/components/child/PermissionGuideCard.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子01 ホームの「見守りのための許可」のカード（子01-B）。export と props はアプリの PermissionGuideCard（src/components/child/PermissionGuideCard.tsx）と同じ。
// まだ許可していないもの（ほかのアプリの上に表示・通知・電池の最適化）を並べ、押すとその設定画面を開く（何を出すかは child-view.ts の permissionGuide）。
// 形（Figma 子01-B。3つのモードで同じ並び）:
//   カード（道具の枠）の中に、見出し「見守りのための許可」（見出しの書体）と 12 の muted の説明。
//   その下に行を3つ。行は1つずつ箱にせず、行の間に細い区切りの線（line の 1px）を引く（カードの中の箱を重ねない）。
//   行: 左に lock 20、太字 14 の題名と 12 の muted の説明、右に ›。押している間は少し地を付ける。押せる高さは 44 以上。
//   画面に入るよう、行の上下は詰める（Figma 子01-B はタブの上までに3行が入る）。説明は2行になるとき「、」の後で折り返す（PhraseText）
import type { NativePermission } from "@contracts/native";
import { tokens } from "@contracts/tokens";
import { Fragment } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { PermissionGuideItem } from "@/components/child/child-view";
import { keepTailTogether } from "@/components/text-wrap";
import { Card, Icon } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { makeStyles, useColors } from "@/lib/theme";
import { fonts } from "../../theme/tool";
import { PhraseText } from "./PhraseText";

type Props = { items: readonly PermissionGuideItem[]; onOpen: (permission: NativePermission) => void };

export function PermissionGuideCard({ items, onOpen }: Props) {
  const c = useColors();
  const styles = useStyles();
  const text = textStyles;
  if (items.length === 0) return null;
  return (
    <Card>
      <View style={styles.head}>
        <Text style={[text.title, { color: c.text }]} accessibilityRole="header">
          見守りのための許可
        </Text>
        <PhraseText style={[text.body, { color: c.muted }]}>
          時間が終わったときに案内を出すために、次の設定をオンにしてください
        </PhraseText>
      </View>
      <View style={styles.list}>
        {items.map((item, i) => (
          <Fragment key={item.permission}>
            {i > 0 && <View style={styles.rule} />}
            <Pressable
              onPress={() => onOpen(item.permission)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}の設定を開く`}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Icon name="lock" size={tokens.size.iconSmall} color={c.text} />
              <View style={styles.itemText}>
                <Text style={[text.itemTitle, { color: c.text }]}>{keepTailTogether(item.title)}</Text>
                <PhraseText style={[text.itemBody, { color: c.muted }]}>{item.body}</PhraseText>
              </View>
              <Icon name="chevron_right" color={c.text} />
            </Pressable>
          </Fragment>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    // Figma 子01-B: 見出しはカードの上の枠から 28（Card の余白より 3 上）、説明は見出しのすぐ下
    head: { gap: 1, marginTop: -3 },
    // 行の並び: 見出しの下に詰めて置き、右は › が枠に寄るよう少しはみ出す（Figma 子01-B: 区切りの線はカードの中の幅より右へ 6 長い）
    list: { marginTop: -8, marginBottom: -17, marginRight: -6 },
    // 行の間の区切り（Figma 子01-B: 1px の線。モードの線の色）
    rule: { height: tokens.size.border, backgroundColor: c.line },
    item: {
      minHeight: tokens.size.touch,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      paddingTop: 6,
      paddingBottom: 5,
      borderRadius: tokens.space[1],
    },
    itemText: { flex: 1 },
    pressed: { backgroundColor: c.surfaceDim },
  }),
);

// 見出し（太字 17。「今日の使用量」と同じ）・説明（12）・行の題名（太字 14）・行の説明（12）。Figma 子01-B の大きさ
const textStyles = StyleSheet.create({
  title: { ...fonts.bold, fontSize: 17, lineHeight: 22 },
  body: { ...fonts.body, fontSize: tokens.font.xs, lineHeight: 18 },
  itemTitle: { ...fonts.bold, fontSize: tokens.font.sm, lineHeight: 20 },
  itemBody: { ...fonts.body, fontSize: tokens.font.xs, lineHeight: 16 },
});
