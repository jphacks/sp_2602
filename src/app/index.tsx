// トップ画面（lead の担当）。アプリの入口。最初はログインの画面（contracts/screens.md の `login`）へ移す。
// login が Google でログインし、役割（未定・保護者・子ども）で role / parent-rules / child-home に振り分ける。
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/login" />;
}
