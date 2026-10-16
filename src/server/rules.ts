// 例（kit:reset では消えない土台）: 制限ルールの保存と取得。DB は必ず db() 経由（src/server/db）。
import { eq } from "drizzle-orm";
import type { AppLimit, Rules } from "../../contracts/schemas";
import { db } from "./db";
import { rules } from "./db/schema";
import { AppError } from "./errors";

export async function getRules(childId: string): Promise<Rules> {
  const d = await db();
  const [row] = await d.select().from(rules).where(eq(rules.childId, childId));
  if (!row) throw new AppError("not_found", "この子どものルールはまだ登録されていません");
  return { childId: row.childId, limits: row.limits as AppLimit[], updatedAt: row.updatedAt.toISOString() };
}

export async function saveRules(childId: string, limits: AppLimit[]): Promise<Rules> {
  const d = await db();
  const updatedAt = new Date();
  await d
    .insert(rules)
    .values({ childId, limits, updatedAt })
    .onConflictDoUpdate({ target: rules.childId, set: { limits, updatedAt } });
  return { childId, limits, updatedAt: updatedAt.toISOString() };
}
