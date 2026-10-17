// 保護者用の画面のまとまり。下部タブ4つ（Figma 親用 TabBar: ホーム／計画／振り返り／設定）。
// ログインしていない・保護者でない人は入口へ戻す（画面で隠すだけでなく、サーバも役割と D2 の連携を確かめる）。
// ParentDataProvider で、見ている子ども（MVP は1人。Q2）とその設定の組（C7）を、どのタブからも同じ値で使えるようにする。
// タブに出ない画面（タブは出たまま）: schedules（親05）・app-usage（親09）・excluded-apps（親16）・blank-periods（空白期間。Q7）
import { Redirect, Tabs } from "expo-router";
import { TabIcon, useTabBarOptions } from "@/components/TabIcon";
import { ParentDataProvider } from "@/lib/parent-data";
import { useSession } from "@/lib/session";

export default function ParentLayout() {
  const tabBarOptions = useTabBarOptions();
  const { state } = useSession();
  if (state.status !== "signedIn" || state.session.role !== "parent") return <Redirect href="/" />;
  return (
    <ParentDataProvider>
      <Tabs screenOptions={tabBarOptions}>
        <Tabs.Screen
          name="home"
          options={{ title: "ホーム", tabBarIcon: (p) => <TabIcon name="home" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="plan"
          options={{ title: "計画", tabBarIcon: (p) => <TabIcon name="register" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="review"
          options={{ title: "振り返り", tabBarIcon: (p) => <TabIcon name="review" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "設定", tabBarIcon: (p) => <TabIcon name="settings" focused={p.focused} /> }}
        />
        <Tabs.Screen name="schedules" options={{ href: null }} />
        <Tabs.Screen name="app-usage" options={{ href: null }} />
        <Tabs.Screen name="excluded-apps" options={{ href: null }} />
        <Tabs.Screen name="blank-periods" options={{ href: null }} />
      </Tabs>
    </ParentDataProvider>
  );
}
