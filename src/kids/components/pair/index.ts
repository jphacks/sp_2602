// tmp/animations/rnweb/whiteboard/components/pair/index.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// QR の紐づけ・ログインの画面だけで使う部品と、画面の分かれ道を決める純粋な関数の入口（ホワイトボード）。
// アプリの src/components/pair/index.ts と同じ名前を全部出す。画面は今までどおり `import { QrCard, childPairReducer } from "@/components/pair";`。
//   見た目を変えた部品（QrCard・RoleChoice）はこのフォルダのもの。
//   計算（child-flow・link-check・login-view・parent-flow・usual-limit-input）と、見た目を変えない部品はアプリの元のものをそのまま出す:
//     - LinkMessages（共01〜共03）は MessageView・Button・AppText だけで描くので、それらが新しい部品になれば見た目もそろう
//       （元のファイルの `@/components` はこの確認ページでは新しい部品を指す）
//     - QrScanner（保護者のカメラ）は子どもの画面ではない（保護者の画面の担当）
export * from "@/components/pair/child-flow";
export { LinkIncomplete, LinkUnknown, LinkUnsure } from "@/components/pair/LinkMessages";
export * from "@/components/pair/link-check";
export * from "@/components/pair/login-view";
export * from "@/components/pair/parent-flow";
export { QrScanner } from "@/components/pair/QrScanner";
export * from "@/components/pair/usual-limit-input";
export { QrCard } from "./QrCard";
export { RoleChoice } from "./RoleChoice";
