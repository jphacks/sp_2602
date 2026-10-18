// tmp/animations/rnweb/whiteboard/components/TabIcon.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 下部タブ（ホワイトボード）。export はアプリの TabIcon.tsx と同じ: TabIcon・useTabBarOptions・hiddenTabOptions。
// アプリは expo-router の Tabs に useTabBarOptions() を screenOptions として渡し、既定の下部タブで描いている。
// だから見た目は screenOptions の中だけで作る（画面のコード・_layout.tsx は変えない）:
//   tabBarBackground … 今の道具のタブの地（useTool().TabBackground。ホワイトボードはアルミのペン置き。Figma の TabBar）
//   tabBarStyle      … 高さ（tab-bar-size.ts の決まり）・上の余白（アイコンの上端を Figma と同じ 24 に）・既定の線と影を消す
//   tabBarIcon       … TabIcon（各画面の options から呼ばれる）。ink の 24。選んでいないタブは muted
//   tabBarLabel      … 12 の文字（選んでいるタブは太字の ink）。選んでいるタブの文字の下に、道具の短い下線（Underline kind="tab"。ホワイトボードは濃い緑のマーカーで 200ms）
import { tokens } from "@contracts/tokens";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarHeight } from "@/components/tab-bar-size";
import { Text } from "@/kids/lib/text";
import { makeStyles, useColors } from "@/lib/theme";
import { makeToolStyles, useTool } from "../tools";
import { Icon, type IconName } from "./Icon";

export function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const c = useColors();
  return <Icon name={name} color={focused ? c.text : c.muted} />;
}

// タブの文字と、選んでいるタブの下線
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  const styles = useStyles();
  const font = useLabelFont();
  const { Underline } = useTool();
  return (
    <View style={styles.labelBox}>
      <Text numberOfLines={1} style={[styles.label, font.label, focused ? styles.labelActive : styles.labelIdle]}>
        {children}
      </Text>
      <View style={styles.underline}>
        <Underline width={34} active={focused} kind="tab" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    bar: {
      height: tokens.size.tabBar,
      backgroundColor: "transparent",
      borderTopWidth: 0,
      elevation: 0,
      shadowOpacity: 0,
      // 既定の下部タブの並び（項目の上の余白 5・アイコンの箱 28）と合わせて、アイコンの上端が Figma と同じ 24 になる
      paddingTop: 17,
    },
    labelBox: { alignItems: "center", height: 22 },
    label: { fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
    labelActive: { color: c.text, fontWeight: tokens.weight.bold },
    labelIdle: { color: c.muted, fontWeight: tokens.weight.regular },
    // 文字のすぐ下（Figma: 文字の下端から 0〜4 の所に太さ 3 の線）
    underline: { position: "absolute", top: 13, left: -20, right: -20, alignItems: "center" },
  }),
);

// 色を使わないスタイル（テーマで変わらない）
const fixedStyles = StyleSheet.create({
  hiddenItem: { display: "none" },
});

// タブに出さない画面の options（アプリと同じ。href: null を使わない理由は src/components/TabIcon.tsx）
export const hiddenTabOptions = { tabBarItemStyle: fixedStyles.hiddenItem } as const;

// Tabs の screenOptions。下のナビゲーションボタンの高さ（insets.bottom）をタブの高さと下の余白に足す（アプリと同じ）
export function useTabBarOptions() {
  const styles = useStyles();
  const c = useColors();
  const { TabBackground } = useTool();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return {
    headerShown: false,
    tabBarActiveTintColor: c.text,
    tabBarInactiveTintColor: c.muted,
    tabBarStyle: [
      styles.bar,
      { height: tabBarHeight(insets.bottom, fontScale), paddingBottom: tokens.space[3] + insets.bottom },
    ],
    // 部品として描く（React Navigation は tabBarBackground を関数として呼ぶ。部品をそのまま渡すと、道具が替わったときに hooks の数が変わって落ちる）
    tabBarBackground: () => <TabBackground />,
    tabBarLabel: TabLabel,
  } as const;
}

// タブの文字の書体（今の道具の本文の書体）
const useLabelFont = makeToolStyles(({ fonts }) => StyleSheet.create({ label: { fontFamily: fonts.body } }));
