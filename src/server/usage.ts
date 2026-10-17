// 使用状況の保存と取得。DB は必ず db() 経由（src/server/db）。
import { desc, eq } from "drizzle-orm";
import type { AppUsage, Usage } from "../../contracts/schemas";
import { db } from "./db";
import { usage } from "./db/schema";
import { AppError } from "./errors";

const toUsage = (row: typeof usage.$inferSelect): Usage => ({
  childId: row.childId,
  date: row.date,
  apps: row.apps as AppUsage[],
  updatedAt: row.updatedAt.toISOString(),
});

export async function saveUsage(childId: string, date: string, apps: AppUsage[]): Promise<Usage> {
  const d = await db();
  const updatedAt = new Date();
  await d
    .insert(usage)
    .values({ childId, date, apps, updatedAt })
    .onConflictDoUpdate({ target: [usage.childId, usage.date], set: { apps, updatedAt } });
  return { childId, date, apps, updatedAt: updatedAt.toISOString() };
}

// 一番新しい日の使用状況を返す
export async function getLatestUsage(childId: string): Promise<Usage> {
  const d = await db();
  const [row] = await d.select().from(usage).where(eq(usage.childId, childId)).orderBy(desc(usage.date)).limit(1);
  if (!row) throw new AppError("not_found", "この子どもの使用状況はまだ届いていません");
  return toUsage(row);
}
