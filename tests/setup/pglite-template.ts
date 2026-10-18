// テスト全体の前に1回だけ走る（vitest.config.ts の globalSetup）。マイグレーション（backend/drizzle）を当てた
// 手元の DB（PGlite）の中身を一時ファイルに書き出し、その場所を SLOPE_TEST_PGLITE_TEMPLATE で各テストに渡す。
// テストのファイルごとの DB（src/server/db/index.ts の connect）は、この写しから開く（中身は別々。ファイル同士で混ざらない）。
// なぜ: 空の PGlite を作る（initdb）のに1つで約7秒かかり、DB を使う18ファイルが並んで同時に作ると、混んだ PC では
//   最初のテストが 30 秒の時間切れになった（2026-10-18）。写しから開くのは約1秒で、マイグレーションはここで本当に当てるので、
//   「マイグレーションと表の定義（backend/src/db/schema）が合っているか」は今までどおり確かめられる。
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../backend/src/db/schema/index";

export default async function setup() {
  const client = new PGlite();
  try {
    await migrate(drizzle({ client, schema }), {
      migrationsFolder: fileURLToPath(new URL("../../backend/drizzle", import.meta.url)),
    });
    const data = await client.dumpDataDir("none");
    const file = join(tmpdir(), `slope-test-pglite-${process.pid}-${randomUUID()}.tar`);
    await writeFile(file, Buffer.from(await data.arrayBuffer()));
    process.env.SLOPE_TEST_PGLITE_TEMPLATE = file;
    return async () => {
      await rm(file, { force: true });
    };
  } finally {
    await client.close();
  }
}
