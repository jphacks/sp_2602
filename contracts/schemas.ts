// データ契約。メンバー間はこのファイルの型だけで繋がる。
// 変更は docs/rules/changes.md の手続きで、必ず CHANGELOG.md に1行書く。
// 下の Role / AppLimit / Rules などは例（ペアレンタルコントロールの中心 =「保護者が決めた制限ルールを子どもの端末に届ける」）。
// キックオフ（kit:reset）で空になるので、DEMO.md の台本に合わせて書き直す。
import { z } from "zod";

// 端末の持ち主の役割。保護者か子どもか（子どもが保護者の権限を取れないことは、サーバ側で検証する）
export const Role = z.enum(["parent", "child"]);
export type Role = z.infer<typeof Role>;

// 子ども1人。保護者と子どもの紐づけ方（認証・ペアリング）は未決（docs/requirements/open.md）なので、ここには id と表示名だけ置く
export const Child = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // 画面に出す名前
});
export type Child = z.infer<typeof Child>;

// アプリ1つぶんの制限。packageName は Android のアプリ識別子（例: com.google.android.youtube）
export const AppLimit = z.object({
  packageName: z.string().min(1),
  label: z.string().min(1), // 画面に出すアプリ名
  dailyMinutes: z.number().int().min(0).max(1440), // 1日に使ってよい分数
});
export type AppLimit = z.infer<typeof AppLimit>;

// 子ども1人ぶんの制限ルール一式（子どもの端末は、最後に同期したこれを端末内で適用する）
export const Rules = z.object({
  childId: z.string().min(1),
  limits: z.array(AppLimit),
  updatedAt: z.string(), // ISO 8601
});
export type Rules = z.infer<typeof Rules>;

// 「どの子どものルールか」を指す入力
export const RulesQuery = z.object({ childId: z.string().min(1) });
export type RulesQuery = z.infer<typeof RulesQuery>;

// 保護者がルールを保存するときの入力
export const RulesSave = z.object({ childId: z.string().min(1), limits: z.array(AppLimit) });
export type RulesSave = z.infer<typeof RulesSave>;

// アプリ1つぶんの、ある1日の使用時間（子どもの端末が測った値）
export const AppUsage = z.object({
  packageName: z.string().min(1),
  label: z.string().min(1),
  usedMinutes: z.number().int().min(0).max(1440),
});
export type AppUsage = z.infer<typeof AppUsage>;

// 子ども1人ぶんの、ある1日の使用状況（子どもの端末が送り、保護者が見る）
export const Usage = z.object({
  childId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // 端末のある日（YYYY-MM-DD）
  apps: z.array(AppUsage),
  updatedAt: z.string(), // ISO 8601
});
export type Usage = z.infer<typeof Usage>;

// 子どもの端末が使用状況を送るときの入力
export const UsageReport = z.object({
  childId: z.string().min(1),
  date: Usage.shape.date,
  apps: z.array(AppUsage),
});
export type UsageReport = z.infer<typeof UsageReport>;

// ストリームの途中で届く1かけら（例: 同期の進み具合の文）
export const SyncChunk = z.object({ text: z.string() });
export type SyncChunk = z.infer<typeof SyncChunk>;
