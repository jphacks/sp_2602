// C7 の epoch（D-109）。サーバの DB ごとに決まる値で、configGet の応答（changed: true / false の両方）に入る。
// サーバを再起動しても（同じ DB を開き直しても）変わらず、DB を作り直すと（別の DB を開くと）変わる。
// 手元のサーバと同じく、PGlite の DB をフォルダ（LOCAL_DB_DIR）に置いて、閉じて開き直すことで再起動をまねる。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigResult } from "@contracts/schemas";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "@/server/db";
import { CHILD, CHILD_ID, ok, post } from "../verify/helpers";

const dirs: string[] = [];
const newDbDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "slope-epoch-"));
  dirs.push(dir);
  return dir;
};

const configGet = async (knownVersion?: number) =>
  ConfigResult.parse(
    await ok(
      post("/api/config/get", { childId: CHILD_ID, ...(knownVersion === undefined ? {} : { knownVersion }) }, CHILD),
    ),
  );

beforeAll(async () => {
  await closeDatabaseForTests(); // ほかのテストのメモリ上の DB ではなく、フォルダの DB を開く
});

afterEach(async () => {
  await closeDatabaseForTests();
  delete process.env.LOCAL_DB_DIR;
});

afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe("C7 の epoch（D-109）", () => {
  it("サーバを再起動しても epoch は変わらない。changed: false の応答にも同じ epoch が入る", {
    timeout: 120_000,
  }, async () => {
    process.env.LOCAL_DB_DIR = await newDbDir();
    const first = await configGet();
    if (!first.changed) throw new Error("changed: true のはず");
    expect(first.epoch).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await configGet(first.snapshot.configVersion)).epoch).toBe(first.epoch);

    await closeDatabaseForTests(); // 再起動（同じフォルダの DB を開き直す）
    const after = await configGet(first.snapshot.configVersion);
    expect(after).toEqual({ changed: false, configVersion: first.snapshot.configVersion, epoch: first.epoch });
  });

  it("DB を作り直す（別の DB を開く）と epoch が変わる", { timeout: 120_000 }, async () => {
    process.env.LOCAL_DB_DIR = await newDbDir();
    const a = await configGet();
    await closeDatabaseForTests();
    process.env.LOCAL_DB_DIR = await newDbDir(); // 前のフォルダを消して作り直したのと同じ（新しい空の DB）
    const b = await configGet();
    expect(b.epoch).not.toBe(a.epoch);
  });
});
