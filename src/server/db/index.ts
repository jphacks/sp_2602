// DB への接続（API の処理と backend/ の保存処理が同じ表を使う）。使う側は `const d = await db()` → Drizzle で書く。
//   DATABASE_URL あり（Vercel の本番・プレビュー）→ Neon。C8・C10 は何段階かの書き込みを1回の処理（トランザクション）で
//     行うので、HTTP ではなく WebSocket の接続（pooled の URL）を使う
//   DATABASE_URL なし（手元・テスト）→ PGlite（Node の中で動く Postgres）。表は backend/src/db/schema から作る。
//     LOCAL_DB_DIR があればそのフォルダに残し（手元のサーバ。src/server/dev.ts が state/pglite を渡す）、なければメモリの上だけ
// MOCK=1 で手元の DB（PGlite）なら、開いたときにデモの3人と見本を入れる（もう入っていれば何もしない。src/server/seed/demo.ts）。
//   DATABASE_URL の DB（Neon など外の DB）には、MOCK=1 でも自動では入れない（seedsMockOnOpen。D-126）。
//   なぜ: デモの人の合言葉は固定で公開されている。vercel env pull で取った本番の DATABASE_URL を手元の .env.local に入れ、
//   MOCK=1 のまま手元のサーバを立てるだけで、本番の DB に固定の合言葉が入っていた（セキュリティ自己点検 🔴1）。
//   外の DB に見本が要るときは npm run db:seed-demo（固定の合言葉は作らない。scripts/seed-demo.ts）
// Vercel では関数のメモリにデータを置いても残らない（呼ぶたびに別のインスタンスになりうる）。保存したいものは必ずここを通す。
import { fileURLToPath } from "node:url";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "../../../backend/src/db/index.js";
import * as schema from "../../../backend/src/db/schema/index.js";
import { isMock } from "../env.js";
import { seedMockAccounts } from "../seed/demo.js";

export { isDatabaseHealthy } from "../../../backend/src/db/health.js";
export type Db = Database;

type RuntimeDb = { db: Db; kind: "neon" | "pglite"; close?: () => Promise<void> };
// 開発中の再読み込みでも作り直さないよう、プロセスに1つだけ持つ
const g = globalThis as unknown as { __slopeRuntimeDb?: Promise<RuntimeDb> };

export async function db(): Promise<Db> {
  return (await runtime()).db;
}

function runtime(): Promise<RuntimeDb> {
  g.__slopeRuntimeDb ??= open().catch((error) => {
    g.__slopeRuntimeDb = undefined; // 失敗したら次の呼び出しでやり直す
    throw error;
  });
  return g.__slopeRuntimeDb;
}

async function open(): Promise<RuntimeDb> {
  const opened = await connect();
  if (seedsMockOnOpen(opened.kind)) await seedMockAccounts(opened.db);
  else if (isMock()) console.warn("MOCK=1 ですが、DATABASE_URL の DB にはデモの3人と見本を自動では入れません（D-126）");
  return opened;
}

// DB を開いたときにデモの3人と見本を入れるか: MOCK=1 で、手元の DB（PGlite）のときだけ
export const seedsMockOnOpen = (kind: RuntimeDb["kind"]): boolean => isMock() && kind === "pglite";

async function connect(): Promise<RuntimeDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }] = await Promise.all([
      import("@neondatabase/serverless"),
      import("drizzle-orm/neon-serverless"),
    ]);
    const pool = new Pool({ connectionString: url, max: 1 });
    return { db: drizzle({ client: pool, schema }) as unknown as Db, kind: "neon", close: () => pool.end() };
  }
  // 本番で黙って手元の DB に保存すると、データが消えても気づけない
  if (process.env.VERCEL_ENV === "production") throw new Error("DATABASE_URL が未設定です（Vercel の本番では必須）");
  const [{ PGlite }, { drizzle }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
  const dir = process.env.LOCAL_DB_DIR?.trim();
  // テストだけ: マイグレーション済みの DB の写し（tests/setup/pglite-template.ts が1回だけ作る）から開く。
  //   空の DB を作るのは重く、並べて走らせると時間切れになるため。マイグレーションは下でいつもどおり当てる（当て済みなら何もしない）
  const template = process.env.VITEST && !dir ? process.env.SLOPE_TEST_PGLITE_TEMPLATE : undefined;
  const client = dir
    ? new PGlite(dir)
    : template
      ? new PGlite({ loadDataDir: await (await import("node:fs")).openAsBlob(template) })
      : new PGlite();
  const local = drizzle({ client, schema });
  // 表は本番（Neon）と同じマイグレーション（backend/drizzle）で作る。フォルダに残した DB には、まだ当てていない分だけ当てる。
  // なぜ: 前は drizzle-kit の pushSchema で表の形を合わせていたが、データの入った DB では確認の質問を出そうとして、
  //   何も表示せずにプロセスを終わらせた（立て直したサーバが起動しない）。マイグレーションなら質問は出ず、
  //   テストのたびに「マイグレーションと表の定義（backend/src/db/schema）が合っているか」も確かめられる
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(local, { migrationsFolder: fileURLToPath(new URL("../../../backend/drizzle", import.meta.url)) });
  // 問い合わせの書き方は同じなので、型は本番にそろえる
  return { db: local as unknown as Db, kind: "pglite", close: () => client.close() };
}

// テスト用: 手元の DB（PGlite）を空にして、seed なら見本を入れ直す。Neon には決して使わない（本物のデータを消さないように）
export async function resetDatabaseForTests(opts: { seed: boolean }): Promise<Db> {
  if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR || !process.env.VITEST)
    throw new Error("resetDatabaseForTests はテストのメモリ上の DB でだけ使えます");
  const opened = await runtime();
  if (opened.kind !== "pglite") throw new Error("resetDatabaseForTests はテストのメモリ上の DB でだけ使えます");
  const tables = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => `"${getTableName(table as PgTable)}"`);
  await opened.db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
  if (opts.seed) await seedMockAccounts(opened.db);
  return opened.db;
}
