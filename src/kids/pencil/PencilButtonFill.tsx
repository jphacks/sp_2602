// tmp/animations/rnweb/whiteboard/pencil/PencilButtonFill.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ノートの主ボタンの地の質感（役目 ButtonFill。土台の担当が足した。ノートの担当の了承済み）。
// 芯の色で塗った丸いボタンに、紙の粒を重ねる（Figma のノートの主ボタン: 黒鉛の塗りに紙の目が白く抜ける）。粒は pencil/Grain の paper。
import { Grain } from "./Grain";

export function PencilButtonFill({ h }: { w: number; h: number; pressed?: boolean }) {
  return <Grain radius={h / 2} opacity={0.9} />;
}
