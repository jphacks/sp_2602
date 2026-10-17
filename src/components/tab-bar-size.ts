// 下部タブの高さ（TabIcon.tsx の useTabBarOptions が使う。React Native を読まない純粋な関数）。
// Figma の高さ 80 は文字の大きさ 1.0 倍のとき。端末の文字を大きくすると、タブの文字の行の高さ（12 の文字で 16）も大きくなるので、
// 増えた分だけタブを高くする。なぜ: 高さを 80 のまま固定すると、文字 1.3 倍では文字の下が約 5 切れる（1.0 倍の端末では気づかない）。
// 下のナビゲーションボタン（|||・○・＜）の高さ（insetBottom）も足す（Android 15 以降は画面が端まで広がるため）。
import { tokens } from "@contracts/tokens";

export function tabBarHeight(insetBottom: number, fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 1 ? fontScale : 1;
  const grow = Math.ceil(tokens.lineHeight.xs * (scale - 1));
  return tokens.size.tabBar + grow + insetBottom;
}
