// 保護者のウィジェット（Figma 親08）の値を端末に保存する、見た目のない部品。parent/_layout.tsx の ParentDataProvider の中に1つ置く。
// 設定（C7）を取るたび（親の画面を開いたとき・30 秒ごと・取り直したとき）に、親03 振り返りと同じ「減り」と次のテストを
// native.saveParentWidget で渡す（Kotlin が保存してウィジェットを保護者の形で描き直す）。値の作り方は widget.ts。
// 設定が無い（unavailable）ときは保存しない（前の値を残す。0 分減と出さない）。ログアウトでは session.tsx の
// native.clearLocalData() がウィジェットの値も消す。
import { todayString } from "@contracts/dates";
import { useEffect } from "react";
import { native } from "@/lib/native";
import { useParentData } from "@/lib/parent-data";
import { parentWidgetData } from "./widget";

export function ParentWidgetSync(): null {
  const { config } = useParentData();
  useEffect(() => {
    if (!config || config.status === "unavailable") return;
    native.saveParentWidget(parentWidgetData(config.snapshot, todayString()));
  }, [config]);
  return null;
}
