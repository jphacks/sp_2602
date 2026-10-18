// QR・連携の見た目の部品の振り分け（決まりは ../kids-switch.tsx と同じ）。
// 画面は今までどおり `import { QrCard, RoleChoice } from "@/components/pair";`（pair/index.ts がここを出す）。
// なぜ ../kids-switch.tsx に置かないか: 今の部品 ./RoleChoice は中で "@/components"（../index.ts）を読む。
//   ../index.ts が読む ../kids-switch.tsx がここの部品まで読むと、import の輪（../index.ts → ../kids-switch.tsx →
//   ./RoleChoice → ../index.ts）になり、読み込みの途中で部品が空のまま使われることがある。ここなら ../index.ts は読まない。
// 新しい部品は入口（@/kids/components/pair の index.ts）でなく、1つずつのファイルから読む
//   （入口はアプリの QrScanner・LinkMessages も出していて、それが "@/components" を読むので輪になる）。
// QrCard は今の部品と同じく memo（QR を描き直さない）。
import { type ComponentProps, memo } from "react";
import { QrCard as KidsQrCard } from "@/kids/components/pair/QrCard";
import { RoleChoice as KidsRoleChoice } from "@/kids/components/pair/RoleChoice";
import { useKidsUI } from "@/kids/KidsUI";
import { QrCard as ClassicQrCard } from "./QrCard";
import { RoleChoice as ClassicRoleChoice } from "./RoleChoice";

export const QrCard = memo(function QrCard(p: ComponentProps<typeof ClassicQrCard>) {
  return useKidsUI() ? <KidsQrCard {...p} /> : <ClassicQrCard {...p} />;
});
export function RoleChoice(p: ComponentProps<typeof ClassicRoleChoice>) {
  return useKidsUI() ? <KidsRoleChoice {...p} /> : <ClassicRoleChoice {...p} />;
}
