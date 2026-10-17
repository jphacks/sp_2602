// トップ画面（lead の担当）。アプリの入口。最初は役割を選ぶ画面（contracts/screens.md の `role`）へ移す。
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/role" />;
}
