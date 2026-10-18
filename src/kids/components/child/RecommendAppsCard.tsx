// tmp/animations/rnweb/whiteboard/components/child/RecommendAppsCard.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 「お勧めアプリはこちらです ›」の横長のカード（子11・子11-B）。export と props はアプリの RecommendAppsCard（src/components/child/RecommendAppsCard.tsx）と同じ。
// 押したときに何を開くかは画面（limit-reached.tsx）が決める。
// 形（Figma 子11）: 道具の枠（ホワイトボード＝手で4辺を引いた線）の高さ 56 の横長の箱。左に apps 24、太字 16 の文、右に › 24（どれも ink）。
//   押している間は少し地を付ける（ListItem と同じ）
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon } from "@/kids/components";
import { makeStyles, useColors } from "@/lib/theme";
import { seedOf, useTool } from "../../tools";

export function RecommendAppsCard({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const c = useColors();
  const { Frame, values } = useTool();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="お勧めアプリはこちらです"
      style={styles.place}
    >
      {({ pressed }) => (
        <Frame
          seed={seedOf("お勧めアプリはこちらです", 23)}
          kind="card"
          style={[styles.card, { borderRadius: values.frame.radius }, pressed && styles.pressed]}
        >
          <Icon name="apps" color={c.text} />
          <View style={styles.text}>
            {/* Figma 子11 は1行（16 の太字）。title だと文字を大きくした端末で「す」だけ次の行に落ちる */}
            <AppText variant="body" strong>
              お勧めアプリはこちらです
            </AppText>
          </View>
          <Icon name="chevron_right" color={c.text} />
        </Frame>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      minHeight: tokens.size.button,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      paddingLeft: tokens.space[5],
      paddingRight: tokens.space[4],
    },
    text: { flex: 1 },
    // Figma 子11: 下の「閉じる」との間は 16（画面の footer の並びの間 8 に、もう 8 足す）
    place: { marginBottom: tokens.space[2] },
    pressed: { backgroundColor: c.surfaceDim },
  }),
);
