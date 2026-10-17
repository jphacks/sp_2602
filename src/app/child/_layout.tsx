// 子ども用の画面のまとまり。下部タブ5つ（Figma 子用 TabBar: ホーム／利用割合／日程登録／日程一覧／設定）。
// ログインしていない・子どもでない人は入口へ戻す（画面で隠すだけでなく、サーバも役割を確かめる）。
// ChildDataProvider で C7（設定）・C2（使用時間）・C3（割合）・C8（送信）を、どのタブからも同じ値で使えるようにする。
// タブに出ない画面（タブは出たまま）: limit-reached（子11）・schedule-edit/[id]（子05）

import { Redirect, Tabs } from "expo-router";
import { TabIcon, useTabBarOptions } from "@/components/TabIcon";
import { ChildDataProvider } from "@/lib/child-data";
import { useSession } from "@/lib/session";

export default function ChildLayout() {
  const tabBarOptions = useTabBarOptions();
  const { state } = useSession();
  if (state.status !== "signedIn" || state.session.role !== "child") return <Redirect href="/" />;
  return (
    <ChildDataProvider childId={state.session.userId}>
      <Tabs screenOptions={tabBarOptions}>
        <Tabs.Screen
          name="home"
          options={{ title: "ホーム", tabBarIcon: (p) => <TabIcon name="home" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="usage"
          options={{ title: "利用割合", tabBarIcon: (p) => <TabIcon name="usage" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="schedule-new"
          options={{ title: "日程登録", tabBarIcon: (p) => <TabIcon name="register" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="schedule-list"
          options={{ title: "日程一覧", tabBarIcon: (p) => <TabIcon name="list" focused={p.focused} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "設定", tabBarIcon: (p) => <TabIcon name="settings" focused={p.focused} /> }}
        />
        <Tabs.Screen name="limit-reached" options={{ href: null }} />
        <Tabs.Screen name="schedule-edit/[id]" options={{ href: null }} />
      </Tabs>
    </ChildDataProvider>
  );
}
