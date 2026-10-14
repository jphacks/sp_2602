// データ契約。メンバー間はこのファイルの型だけで繋がる。
// 変更は docs/rules/changes.md の手続きで、必ず CHANGELOG.md に1行書く。
// npm run kit:reset でひな型の例を消した状態。課題に合わせて型を足す:
//   export const Foo = z.object({ id: z.string(), name: z.string().min(1) });
//   export type Foo = z.infer<typeof Foo>;
import { z } from "zod";

// 画面とサーバで共通に使う小さな型（不要なら消してよい）
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;
