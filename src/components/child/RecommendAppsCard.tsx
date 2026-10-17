// 「お勧めアプリはこちらです ›」の横長のカード（Figma 子11。白地に青い枠・左に4マスのアイコン・右に青い ›）。
// 押したときに何を開くかは画面（limit-reached.tsx）が決める。
//   <RecommendAppsCard onPress={openRecommended} />
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon } from "@/components";
import { makeStyles, useColors } from "@/lib/theme";

export function RecommendAppsCard({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="お勧めアプリはこちらです"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Icon name="apps" color={c.primary} />
      <View style={styles.text}>
        {/* Figma 子11 は1行（16 の中くらいの太さ）。title だと文字を大きくした端末で「す」だけ次の行に落ちる */}
        <AppText variant="body" strong>
          お勧めアプリはこちらです
        </AppText>
      </View>
      <Icon name="chevron_right" color={c.primary} />
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
      paddingHorizontal: tokens.space[5],
      backgroundColor: c.surface,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.primary,
    },
    text: { flex: 1 },
    pressed: { backgroundColor: c.surfaceDim },
  }),
);
