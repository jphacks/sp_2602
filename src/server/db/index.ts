// DB への接続（back-a の担当）。使う側は `const d = await db()` → `d.insert(rules).values(...)` のように Drizzle で書く。
//   DATABASE_URL あり（Vercel の本番・プレビュー、手元で vercel env pull した時）→ Neon（HTTP で1回ずつ問い合わせる。接続の使い回しが要らない）
//   DATABASE_URL なし（手元・テスト・CI）→ メモリ上の Postgres（PGlite）。テーブルは schema.ts から作る。サーバを止めると空に戻る
// Vercel では関数のメモリにデータを置いても残らない（呼ぶたびに別のインスタンスになりうる）。保存したいものは必ずここを通す。
// Neon の HTTP 接続では db.transaction() が使えない。まとめて書くなら db.batch([...])。
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

// 開発中の再読み込みでも作り直さないよう、プロセスに1つだけ持つ
const g = globalThis as unknown as { __kitDb?: Promise<Db> };

export function db(): Promise<Db> {
  g.__kitDb ??= open().catch((e) => {
    g.__kitDb = undefined; // 失敗したら次の呼び出しでやり直す
    throw e;
  });
  return g.__kitDb;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle({ client: neon(url), schema });
  }
  // 本番で黙ってメモリに保存すると、データが消えても気づけない
  if (process.env.VERCEL_ENV === "production")
    throw new Error("DATABASE_URL が未設定（Vercel の本番では必須。Neon を Marketplace から追加すると入る）");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const local = drizzle({ client: new PGlite(), schema });
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(schema, local as never);
  await apply();
  // 問い合わせの書き方は同じなので、型は本番（Neon）にそろえる
  return local as unknown as Db;
}
