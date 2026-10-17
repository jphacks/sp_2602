import { eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { serverMeta } from "./schema/server-meta.js";

/**
 * この DB の epoch（C7 の設定の応答に入れる値。docs/decisions.md D-109）。
 * 行がなければ（作ったばかりの DB・テストで表を空にした後）ここで1回だけ作る。同時に作ろうとしても先に入った1つに決まる。
 * プロセスのメモリには持たない（動いているサーバの裏で DB を作り直しても、次の応答から新しい値になるように）。
 */
export async function readServerEpoch(db: Database): Promise<string> {
  const read = async () =>
    (await db.select({ epoch: serverMeta.epoch }).from(serverMeta).where(eq(serverMeta.id, 1)).limit(1))[0]?.epoch;
  const found = await read();
  if (found) return found;
  await db.insert(serverMeta).values({ id: 1 }).onConflictDoNothing({ target: serverMeta.id });
  const created = await read();
  if (!created) throw new Error("server_meta の epoch を作れませんでした");
  return created;
}
