// 保護者のウィジェット（Figma 親08）の値を端末に保存する、見た目のない部品。parent/_layout.tsx の ParentDataProvider の中に1つ置く。
// 設定（C7）を取るたび（親の画面を開いたとき・30 秒ごと・取り直したとき）に、親03 振り返りと同じ「減り」と次のテストを
// native.saveParentWidget で渡す（Kotlin が保存してウィジェットを保護者の形で描き直す）。値の作り方は widget.ts。
// 設定が無い（unavailable）ときは保存しない（前の値を残す。0 分減と出さない）。ログアウトでは session.tsx の
// native.clearLocalData() がウィジェットの値も消す。
// 家族の一覧が空（子どもとの連携を外した・つながっていない）と分かったら、「つながっていません」にする（前の子どもの数字を残さない。D-133）。
// 連携を外した直後は、外した画面（UnlinkChildItem.tsx）も同じ値を保存する（すぐ QR の読み取りへ移り、この部品が外れるため）。
import { todayString } from "@contracts/dates";
import { useEffect } from "react";
import { native } from "@/lib/native";
import { useParentData } from "@/lib/parent-data";
import { parentWidgetData, unlinkedParentWidgetData } from "./widget";

export function ParentWidgetSync(): null {
  const { config, family } = useParentData();
  const unlinked = family != null && family.length === 0;
  useEffect(() => {
    if (unlinked) {
      native.saveParentWidget(unlinkedParentWidgetData(todayString()));
      return;
    }
    if (!config || config.status === "unavailable") return;
    native.saveParentWidget(parentWidgetData(config.snapshot, todayString()));
  }, [config, unlinked]);
  return null;
}
