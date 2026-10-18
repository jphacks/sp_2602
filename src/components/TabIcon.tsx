// 下部タブのアイコンと見た目（Figma の TabBar: 高さ 80・選ばれたタブは 64×32 の薄い青の丸の中に青いアイコン、文字は青の太字）。
// 子ども用・保護者用の Tabs（src/app/child/_layout.tsx・parent/_layout.tsx）で同じものを使う。
import { tokens } from "@contracts/tokens";
import { type ComponentProps, useCallback } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon as KidsTabIcon, useTabBarOptions as useKidsTabBarOptions } from "@/kids/components/TabIcon";
import { useKidsUI } from "@/kids/KidsUI";
import { makeStyles, useColors } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";
import { tabBarHeight } from "./tab-bar-size";

function ClassicTabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const styles = useStyles();
  const c = useColors();
  return (
    <View style={[styles.indicator, focused && styles.active]}>
      <Icon name={name} color={focused ? c.primary : c.muted} />
    </View>
  );
}

// タブの文字（選ばれたタブだけ太字。Figma のタブ部品）
function TabLabel({ focused, children }: { focused: boolean; children: string }) {
  const styles = useStyles();
  return <Text style={[styles.label, focused ? styles.labelActive : styles.labelIdle]}>{children}</Text>;
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    indicator: {
      width: tokens.size.tabIndicatorWidth,
      height: tokens.size.tabIndicatorHeight,
      borderRadius: tokens.radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    active: { backgroundColor: c.primarySoft },
    bar: {
      height: tokens.size.tabBar,
      backgroundColor: c.surfaceDim,
      borderTopColor: c.line,
      paddingTop: tokens.space[3],
      paddingBottom: tokens.space[3],
    },
    label: { fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs, fontWeight: tokens.weight.medium },
    labelActive: { color: c.primary, fontWeight: tokens.weight.bold },
    labelIdle: { color: c.muted },
  }),
);

// 色を使わないスタイル（テーマで変わらない）
const fixedStyles = StyleSheet.create({
  hiddenItem: { display: "none" },
});

// タブに出さない画面（子05・子11・親05・親09・親16・空白期間）の options。
// なぜ href: null を使わないか: expo-router 58 では href: null の画面は「隠したタブ」になり、その画面を開くと
// 最初のタブ（ホーム）へ戻されてしまう（useVisibleTabsWithRedirect。実機 SC-53C で一覧の項目を押すとホームに戻った）。
// タブのボタンだけを消せば、画面は開けて、下部タブも出たままになる。
export const hiddenTabOptions = { tabBarItemStyle: fixedStyles.hiddenItem } as const;

// Tabs の screenOptions（上のバーは各画面の <Screen> が描くので出さない）。
// Android 15 以降は画面が端まで広がる（edge-to-edge）ので、下のナビゲーションボタン（|||・○・＜）の高さ（insets.bottom）を
// タブの高さと下の余白に足す。足さないと、タブの文字がナビゲーションボタンの下に隠れる（実機 SC-53C・Android 16 で確認）。
function useClassicTabBarOptions() {
  const styles = useStyles();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return {
    headerShown: false,
    tabBarActiveTintColor: c.primary,
    tabBarInactiveTintColor: c.muted,
    // 高さと余白は端末ごとの値（ナビゲーションボタンの高さ・文字の大きさ。tab-bar-size.ts）から計算するので、StyleSheet の固定値に重ねる
    tabBarStyle: [
      styles.bar,
      { height: tabBarHeight(insets.bottom, fontScale), paddingBottom: tokens.space[3] + insets.bottom },
    ],
    tabBarLabel: TabLabel,
  } as const;
}

// ── 子ども用の見た目への振り分け（決まりは ../kids-switch.tsx。この部品は画面がファイルを直接読むので、ここで振り分ける） ──

export function TabIcon(p: ComponentProps<typeof ClassicTabIcon>) {
  return useKidsUI() ? <KidsTabIcon {...p} /> : <ClassicTabIcon {...p} />;
}

// hooks の決まりで、両方を毎回呼んでから選ぶ。
// 子ども用のタブの地（今の道具の TabBackground）は、関数で包んで「部品として」描く:
//   React Navigation は tabBarBackground を部品ではなく関数として呼ぶ（tabBarBackground()）。部品をそのまま渡すと、
//   その部品の hooks がタブの列の中で呼ばれ、テーマを替えて道具（マーカー → チョーク）が変わると hooks の数が変わって落ちる。
export function useTabBarOptions() {
  const kids = useKidsUI();
  const kidsOptions = useKidsTabBarOptions();
  const classicOptions = useClassicTabBarOptions();
  const Background = kidsOptions.tabBarBackground;
  const tabBarBackground = useCallback(() => <Background />, [Background]);
  return kids ? { ...kidsOptions, tabBarBackground } : classicOptions;
}
