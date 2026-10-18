// 帯（Banner）の tone ごとの色の名前（純粋な表。値は今のテーマの palettes から引く）。
// Banner.tsx の中の bg・fg の表と同じ組（Banner.tsx は React Native を読むので、テストから使えるようにここにも置いた。
// Banner.tsx がこの表を import するように寄せるのは、Banner を触ってよい人がする）。
// 使い道: 白色・黒色の両方で帯の文字が読めることのテスト（tests/parent/device-alerts.test.ts）
import type { ColorName } from "@contracts/tokens";

export type BannerTone = "info" | "warning" | "danger" | "success";

// 地の色
export const bannerBg: Readonly<Record<BannerTone, ColorName>> = {
  info: "primarySoft",
  warning: "warningSoft",
  danger: "dangerSoft",
  success: "successSoft",
};

// 文字・アイコンの色
export const bannerFg: Readonly<Record<BannerTone, ColorName>> = {
  info: "onPrimarySoft",
  warning: "warning",
  danger: "danger",
  success: "success",
};
