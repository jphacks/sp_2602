// データ契約。メンバー間はこのファイルの型だけで繋がる。
// 変更は docs/rules/changes.md の手続きで、必ず CHANGELOG.md に1行書く。
// 下の Item / AnalyzeRequest / AnalyzeResult は例。Hack Day に課題に合わせて書き換える。
import { z } from "zod";

export const Item = z.object({
  id: z.string(),
  name: z.string().min(1),
  note: z.string().optional(),
});
export type Item = z.infer<typeof Item>;

export const AnalyzeRequest = z.object({
  items: z.array(Item).min(1),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const AnalyzeResult = z.object({
  summary: z.string(),
  verdicts: z.array(z.object({ itemId: z.string(), label: z.enum(["keep", "reduce", "drop"]), reason: z.string() })),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResult>;

// ストリームの途中で届く1かけら（例: AI の返答の続き、進み具合の文）
export const AnalyzeChunk = z.object({ text: z.string() });
export type AnalyzeChunk = z.infer<typeof AnalyzeChunk>;
