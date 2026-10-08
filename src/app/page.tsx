// 入口（lead の所有）。最初の画面へ送るだけ。
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/home");
}
