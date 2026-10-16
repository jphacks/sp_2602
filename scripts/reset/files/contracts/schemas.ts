// データ契約。メンバー間はこのファイルの型だけで繋がる。
// 変更は docs/rules/changes.md の手続きで、必ず CHANGELOG.md に1行書く。
// npm run kit:reset でひな型の例を消した状態。課題に合わせて型を足す:
//   export const Foo = z.object({ id: z.string(), name: z.string().min(1) });
//   export type Foo = z.infer<typeof Foo>;
import { z } from "zod";

// 画面とサーバで共通に使う小さな型（不要なら消してよい）
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

// 次の2つは contracts/native.ts（Kotlin の窓口の型）が使うので、kit:reset 後も残す。課題に合わせて形を変えるときは native.ts も一緒に直す。
// アプリ1つぶんの制限。packageName は Android のアプリ識別子（例: com.google.android.youtube）
export const AppLimit = z.object({
  packageName: z.string().min(1),
  label: z.string().min(1), // 画面に出すアプリ名
  dailyMinutes: z.number().int().min(0).max(1440), // 1日に使ってよい分数
});
export type AppLimit = z.infer<typeof AppLimit>;

// アプリ1つぶんの、ある1日の使用時間（端末が測った値）
export const AppUsage = z.object({
  packageName: z.string().min(1),
  label: z.string().min(1),
  usedMinutes: z.number().int().min(0).max(1440),
});
export type AppUsage = z.infer<typeof AppUsage>;
