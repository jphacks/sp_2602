// QR の紐づけ・ログインの画面（src/app/login.tsx・src/app/pair/）だけで使う部品と、画面の分かれ道を決める純粋な関数の入口。
//   画面は `import { LinkUnknown, childPairReducer } from "@/components/pair";` のように使う。
export * from "./child-flow";
export { LinkIncomplete, LinkUnknown, LinkUnsure } from "./LinkMessages";
export * from "./link-check";
export * from "./login-view";
export * from "./parent-flow";
export { QrCard } from "./QrCard";
export { QrScanner } from "./QrScanner";
export { RoleChoice } from "./RoleChoice";
export * from "./usual-limit-input";
