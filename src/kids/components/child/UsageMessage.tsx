// tmp/animations/rnweb/whiteboard/components/child/UsageMessage.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 「今日の使用量」の割合が出せないときの案内（制限なし・上限未設定・権限なし・取得不可）。子01・子02・子11 で使う。
// export と props はアプリの UsageMessage（src/components/child/UsageMessage.tsx）と同じ。文言と押したときの動きは child-view.ts の usageView。
// 形（Figma 子01-A・子01-E・子01-F・子01-G。3つのモードで同じ並び）:
//   カードの中: 左にアイコン 20（ink）、右に太字の題 14（本文の書体）と、その下に 12 の muted の本文。
//   ボタン（「もう一度ためす」「設定を開く」）は、文の下の左に線だけの小さい丸いボタン（見た目 40・押せる 44）。
//   center（子02 のようにカードの外で中央に置く）: アイコンを上に、題・本文・ボタンを中央に（Figma にない状態。アプリの並びのまま）。
//   tone="warning" でも色を変えない（注意も ink とアイコンで伝える。赤・黄を使わない）
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import type { UsageMessage as Message } from "@/components/child/child-view";
import { keepTailTogether } from "@/components/text-wrap";
import { AppText, Button, Icon } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { useColors } from "@/lib/theme";
import { makeToolStyles } from "../../tools";
import { PhraseText } from "./PhraseText";

type Props = {
  message: Message;
  onAction: (kind: NonNullable<Message["action"]>["kind"]) => void;
  center?: boolean; // 子02 のようにカードの外で中央に置くとき
};

export function UsageMessage({ message, onAction, center = false }: Props) {
  const c = useColors();
  const text = useTextStyles();
  const action = message.action && (
    <Button
      variant={center ? "outline" : "pill"}
      label={message.action.label}
      onPress={() => message.action && onAction(message.action.kind)}
    />
  );
  if (center) {
    return (
      <View style={[styles.box, styles.center]} accessibilityLiveRegion="polite">
        <View style={styles.rowCenter}>
          <Icon name={message.icon} color={c.text} />
          <View style={styles.textCenter}>
            <AppText variant="title" center>
              {message.title}
            </AppText>
            <AppText tone="muted" center>
              {message.body}
            </AppText>
          </View>
        </View>
        {action}
      </View>
    );
  }
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Icon name={message.icon} size={tokens.size.iconSmall} color={c.text} />
        <View style={styles.text}>
          <Text style={[text.title, { color: c.text }]}>{keepTailTogether(message.title)}</Text>
          <PhraseText style={[text.body, { color: c.muted }]} boxStyle={styles.bodyBox}>
            {message.body}
          </PhraseText>
        </View>
      </View>
      {/* 丸いボタンは左に寄せる（横に並べる箱に入れると、ボタンの幅は文字の幅になる） */}
      {action && <View style={styles.actionRow}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma 子01-A: 本文の下から丸いボタンまで 16
  box: { gap: tokens.space[4] },
  center: { alignItems: "stretch", paddingVertical: tokens.space[6] },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  rowCenter: { flexDirection: "column", alignItems: "center", gap: tokens.space[3] },
  text: { flex: 1, gap: 4 },
  // 本文は 1行を短めに（Figma 子01-A・子01-F・子01-G の文の箱の幅）。2行になるときは「、」「。」の後で折り返す（PhraseText）
  bodyBox: { maxWidth: 204 },
  textCenter: { gap: tokens.space[1] },
  actionRow: { flexDirection: "row" },
});

// 題（太字 14）と本文（12）。本文は Figma 子01-A の行の間 19（AppText の caption 16 より広い）
const useTextStyles = makeToolStyles(({ fonts }) =>
  StyleSheet.create({
    title: { fontFamily: fonts.body, fontWeight: "700", fontSize: tokens.font.sm, lineHeight: 20 },
    body: { fontFamily: fonts.body, fontWeight: "400", fontSize: tokens.font.xs, lineHeight: 19 },
  }),
);
