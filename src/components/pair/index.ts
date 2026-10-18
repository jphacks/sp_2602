// QR の紐づけ・ログインの画面（src/app/login.tsx・src/app/pair/）だけで使う部品と、画面の分かれ道を決める純粋な関数の入口。
//   画面は `import { LinkUnknown, childPairReducer } from "@/components/pair";` のように使う。
//   見た目の部品（QrCard・RoleChoice）は ./kids-switch.tsx を通す（子ども用の見た目の中なら新しい部品）。
//   LinkMessages は中で @/components の部品を使うので、子ども用の見た目の中では自然に新しい部品で描かれる。

export * from "./child-flow";
export { QrCard, RoleChoice } from "./kids-switch";
export { LinkIncomplete, LinkUnknown, LinkUnsure } from "./LinkMessages";
export * from "./link-check";
export * from "./login-view";
export * from "./parent-flow";
export { QrScanner } from "./QrScanner";
export * from "./usual-limit-input";
