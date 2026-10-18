// C7 の epoch（D-109）。サーバの DB ごとに決まる値で、configGet の応答（changed: true / false の両方）に入る。
// サーバを再起動しても（同じ DB を開き直しても）変わらず、DB を作り直すと（別の DB を開く・表を空にする）変わる。
// 再起動は「同じ DB の中身を新しい PGlite で開き直し、起動時と同じくマイグレーションを当て直す」でまねる
// （中身は dumpDataDir → loadDataDir でメモリの上だけで移す。フォルダの DB を作るのは重く、ほかのテストと並べると時間切れを起こした）。
import { fileURLToPath } from "node:url";
import { ConfigResult } from "@contracts/schemas";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { type Db, resetDatabaseForTests } from "@/server/db";
import * as schema from "../../backend/src/db/schema/index";
import { readServerEpoch } from "../../backend/src/db/server-epoch";
import { CHILD, CHILD_ID, ok, post } from "../verify/helpers";

const configGet = async (knownVersion?: number) =>
  ConfigResult.parse(
    await ok(
      post("/api/config/get", { childId: CHILD_ID, ...(knownVersion === undefined ? {} : { knownVersion }) }, CHILD),
    ),
  );

// src/server/db/index.ts の connect と同じ開き方（PGlite を開いて、まだ当てていないマイグレーションを当てる）
async function openPglite(loadDataDir?: Blob | File) {
  const client = new PGlite(loadDataDir ? { loadDataDir } : undefined);
  const local = drizzle({ client, schema });
  await migrate(local, { migrationsFolder: fileURLToPath(new URL("../../backend/drizzle", import.meta.url)) });
  return { client, db: local as unknown as Db };
}

describe("C7 の epoch（D-109）", () => {
  beforeEach(async () => {
    await resetDatabaseForTests({ seed: true });
  });

  it("configGet の応答は changed: true / false のどちらにも同じ epoch が入り、取り直しても変わらない", async () => {
    const first = await configGet();
    if (!first.changed) throw new Error("changed: true のはず");
    expect(first.epoch).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await configGet(first.snapshot.configVersion)).toEqual({
      changed: false,
      configVersion: first.snapshot.configVersion,
      epoch: first.epoch,
    });
    expect((await configGet()).epoch).toBe(first.epoch);
  });

  it("同じ DB でも、表を空にして見本を入れ直す（作り直す）と epoch が変わる。作り直した後はまた同じ値のまま", async () => {
    const before = await configGet();
    await resetDatabaseForTests({ seed: true });
    const after = await configGet();
    expect(after.epoch).not.toBe(before.epoch);
    expect((await configGet()).epoch).toBe(after.epoch);
  });

  // PGlite を2つ開くので、ほかのテストと並べても時間切れにならないよう長めに待つ
  it("サーバを再起動しても（同じ DB を開き直してマイグレーションを当て直しても）epoch は変わらない。別の DB では違う", {
    timeout: 120_000,
  }, async () => {
    const running = await openPglite();
    const epoch = await readServerEpoch(running.db);
    expect(await readServerEpoch(running.db)).toBe(epoch);
    const data = await running.client.dumpDataDir();
    await running.client.close();

    const restarted = await openPglite(data);
    expect(await readServerEpoch(restarted.db)).toBe(epoch);
    await restarted.client.close();

    // 別の DB（テストのメモリ上の DB。PGlite と Neon を切り替えたのと同じ）は別の値
    expect((await configGet()).epoch).not.toBe(epoch);
  });
});
