// 下部タブのアイコンと見た目（Figma の TabBar: 高さ 80・選ばれたタブは 64×32 の薄い青の丸の中にアイコン）。
// 子ども用・保護者用の Tabs（src/app/child/_layout.tsx・parent/_layout.tsx）で同じものを使う。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";

export function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.indicator, focused && styles.active]}>
      <Icon name={name} color={focused ? tokens.color.onPrimarySoft : tokens.color.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: tokens.size.tabIndicatorWidth,
    height: tokens.size.tabIndicatorHeight,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: tokens.color.primarySoft },
  bar: {
    height: tokens.size.tabBar,
    backgroundColor: tokens.color.surfaceDim,
    borderTopColor: tokens.color.line,
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[3],
  },
  label: { fontSize: tokens.font.xs, fontWeight: tokens.weight.medium },
});

// Tabs の screenOptions（上のバーは各画面の <Screen> が描くので出さない）。
// Android 15 以降は画面が端まで広がる（edge-to-edge）ので、下のナビゲーションボタン（|||・○・＜）の高さ（insets.bottom）を
// タブの高さと下の余白に足す。足さないと、タブの文字がナビゲーションボタンの下に隠れる（実機 SC-53C・Android 16 で確認）。
export function useTabBarOptions() {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: tokens.color.primary,
    tabBarInactiveTintColor: tokens.color.muted,
    // 高さと余白は端末ごとの値から計算するので、StyleSheet の固定値に重ねる
    tabBarStyle: [
      styles.bar,
      { height: tokens.size.tabBar + insets.bottom, paddingBottom: tokens.space[3] + insets.bottom },
    ],
    tabBarLabelStyle: styles.label,
  } as const;
}
