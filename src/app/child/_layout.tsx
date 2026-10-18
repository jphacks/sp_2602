// 子ども用の画面のまとまり。下部タブ5つ（Figma 子用 TabBar: ホーム／利用割合／日程登録／日程一覧／設定）。
// ログインしていない・子どもでない人は入口へ戻す（画面で隠すだけでなく、サーバも役割を確かめる）。
// ChildDataProvider で C7（設定）・C2（使用時間）・C3（割合）・C8（送信）を、どのタブからも同じ値で使えるようにする。
// タブに出ない画面（タブは出たまま）: limit-reached（子11）・schedule-edit/[id]（子05）

import { Redirect, Tabs } from "expo-router";
import { hiddenTabOptions, TabIcon, useTabBarOptions } from "@/components/TabIcon";
import { withKidsUI } from "@/kids/KidsUI";
import { ChildDataProvider } from "@/lib/child-data";
import { useSession } from "@/lib/session";

function ChildLayout() {
  const tabBarOptions = useTabBarOptions();
  const { state } = useSession();
  if (state.status !== "signedIn" || state.session.role !== "child") return <Redirect href="/" />;
  return (
    // key: サーバ上の自分の id が変わったら（child-data.tsx が 403 で確かめ直した結果）、前の id の設定・使用時間を持ち越さずに作り直す
    <ChildDataProvider key={state.session.userId} childId={state.session.userId}>
      {/* backBehavior="history": 「←」や戻るボタンで、来た画面へ戻す（既定の firstRoute だと、タブに出ない画面からいつもホームへ戻る） */}
      <Tabs screenOptions={tabBarOptions} backBehavior="history">
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
        <Tabs.Screen name="limit-reached" options={hiddenTabOptions} />
        <Tabs.Screen name="schedule-edit/[id]" options={hiddenTabOptions} />
      </Tabs>
    </ChildDataProvider>
  );
}

// 子ども用の画面はすべて子ども用の見た目（src/kids。Figma「UI子供用」）。タブの見た目（useTabBarOptions）も中で決まるので、外側から包む。
export default withKidsUI(ChildLayout);
