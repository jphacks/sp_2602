// tmp/animations/rnweb/whiteboard/components/pair/RoleChoice.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 役割選び（入02）の大きな選択肢1つ。props はアプリの RoleChoice（src/components/pair/RoleChoice.tsx）と同じ。カード全体を押せる。
// 形（Figma 入02 60:3697）: 地は塗らず、今の道具の枠（useTool().Frame。ホワイトボードは手で4辺を引いた線・角 8）。
//   左に ink のアイコン 32、題名は見出しの書体 18（title）、説明は 14 の muted（small）、右に ink の「›」24。
//   説明3行で高さ 123（左 18・右 14・上 15・下 14。文字は x=89 から）。青いアイコン（アプリの primary）は使わない（ink）。
//   押している間は少し地を付ける（押したことが分かるように。ListItem と同じ）。
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, type IconName } from "@/kids/components";
import { makeStyles, useColors } from "@/lib/theme";
import { seedOf, useTool } from "../../tools";

type Props = { icon: IconName; title: string; description: string; onPress: () => void };

export function RoleChoice({ icon, title, description, onPress }: Props) {
  const styles = useStyles();
  const c = useColors();
  const { Frame, values } = useTool();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description}>
      {({ pressed }) => (
        <Frame
          seed={seedOf(title, 29)}
          kind="card"
          style={[styles.card, { borderRadius: values.frame.radius }, pressed && styles.pressed]}
        >
          <Icon name={icon} size={tokens.size.iconLarge} color={c.text} />
          <View style={styles.text}>
            <AppText variant="title">{title}</AppText>
            <AppText variant="small" tone="muted">
              {description}
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
      minHeight: tokens.size.listItemTall,
      flexDirection: "row",
      alignItems: "center",
      gap: 15,
      paddingLeft: 18,
      paddingRight: 14,
      paddingTop: 15,
      paddingBottom: 14,
    },
    pressed: { backgroundColor: c.surfaceDim },
    // 「›」との間を空ける（説明が「›」に近づきすぎないように）
    text: { flex: 1, gap: 5, paddingRight: tokens.space[1] },
  }),
);
