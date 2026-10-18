// tmp/animations/rnweb/whiteboard/tools/scheme-colors.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 描き方（marker/・chalk/・pencil/）の中で、今の配色を当てた道具の色を読むための入口。
// components/ の部品は useTool().values.colors を読む（こちらは使わない）。描き方の部品は自分の道具が決まっているので、
// 道具の名前を渡して読む（tools/index.tsx を読むと、tools/marker.tsx などとの読み合いの輪になるので、ここは index を読まない）。
//   const colors = useToolColors("marker");   // colors.used・colors.test など（配色で替わる）
import { useColorScheme } from "@/lib/theme";
import { schemedValues } from "../theme/schemes";
import type { ToolName, ToolValues } from "../theme/tool";

export function useToolColors(name: ToolName): ToolValues["colors"] {
  const { scheme } = useColorScheme();
  return schemedValues(name, scheme).colors;
}
