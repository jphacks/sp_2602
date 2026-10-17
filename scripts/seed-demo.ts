// 本番・プレビューの DB（Neon）に、デモ用の見本（通常上限・2週間前に始まった計画・テスト・対象外アプリ・過去6日の利用記録）を入れる。
// Google でログインして QR で紐づけた親子1組に入れる。デモの固定の合言葉（MOCK のログイン）は作らない。
// 使い方（DATABASE_URL は入れたい DB のもの。例: vercel env pull --environment=production .env.production.local）:
//   npm run db:seed-demo -- --env-file=.env.production.local                  … 連携済みの親子の一覧を出すだけ（何も書かない）
//   npm run db:seed-demo -- --env-file=.env.production.local --child <userId>  … その子どもと保護者に見本を入れる
// 計画・通常上限・テスト・対象外アプリは見本で上書きする。利用記録は、その日にもっと新しい測定があれば、そちらが残る。
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connectDatabase } from "../backend/src/db/index.js";
import { familyLinks, users } from "../backend/src/db/schema/index.js";
import { seedDemoFamily } from "../src/server/seed/demo.js";

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// --env-file で DATABASE_URL を読む（npm run の後ろに付けるだけで使えるように、node の --env-file ではなくここで読む）
const envFile = argValue("env-file");
if (envFile) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) process.env[m[1]] ??= m[2].replace(/^"(.*)"$/, "$1");
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL がありません。--env-file=<vercel env pull で取ったファイル> を付けてください");
  process.exit(1);
}

const { db, client } = connectDatabase({ maxConnections: 1 });
try {
  const parent = alias(users, "parent");
  const child = alias(users, "child");
  const families = await db
    .select({
      parentId: familyLinks.parentId,
      parentName: parent.displayName,
      childId: familyLinks.childId,
      childName: child.displayName,
      linkedAt: familyLinks.createdAt,
    })
    .from(familyLinks)
    .innerJoin(parent, eq(parent.id, familyLinks.parentId))
    .innerJoin(child, eq(child.id, familyLinks.childId))
    .orderBy(familyLinks.createdAt);
  const childId = argValue("child");
  if (!childId) {
    console.log(`連携済みの親子: ${families.length} 組（--child <子どもの userId> で見本を入れます）`);
    for (const f of families)
      console.log(
        `  子ども ${f.childName ?? "?"}（${f.childId}） ← 保護者 ${f.parentName ?? "?"}  連携 ${f.linkedAt.toISOString()}`,
      );
  } else {
    const family = families.find((f) => f.childId === childId);
    if (!family) throw new Error(`連携済みの子どもに ${childId} がいません（--child なしで一覧を見てください）`);
    await seedDemoFamily(db, { parentId: family.parentId, childId: family.childId });
    console.log(`見本を入れました: 子ども ${family.childName ?? "?"} ← 保護者 ${family.parentName ?? "?"}`);
  }
} finally {
  await client.end();
}
