// 契約と実装のずれを検査する（lead の担当）。規則は scripts/lib/gaps.mjs と同じ。
// API の処理は src/server/handlers/<API名>.ts と index.ts の export、画面は src/app/<画面id>/index.tsx。
// 契約が先・実装が後: 第1統合（milestones の integrate）より前は警告だけ。第1統合以降（または KIT_STRICT_CONTRACTS=1）は失敗。
// npm run kit:reset 後の状態（役割 Role の検査と kit:reset の照合表は、ひな型の例なので外してある）。
// すき間は lead が npm run kit:stub で「仮のファイル」を置けば埋まる。未実装の一覧は npm run now が担当者に出す。
import { existsSync, readFileSync } from "node:fs";
import { api } from "@contracts/api";
import { fixtures } from "@contracts/fixtures";
import { describe, expect, it } from "vitest";
import cfg from "../kit.config.json";

const integrate = cfg.milestones.find((m) => m.id === "integrate");
const strict = process.env.KIT_STRICT_CONTRACTS === "1" || (!!integrate && Date.now() >= Date.parse(integrate.at));

function check(ok: boolean, what: string) {
  if (!ok && !strict) console.warn(`[未実装] ${what}（第1統合までに必要。lead は npm run kit:stub）`);
  if (strict) expect(ok, what).toBe(true);
}

const rows = readFileSync("contracts/screens.md", "utf8")
  .split("\n")
  .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
  .map((l) => {
    const c = l.split("|").map((s) => s.trim());
    const types = (cell = "") => [...cell.matchAll(/\b[A-Z][A-Za-z0-9]+\b/g)].map((m) => m[0]);
    return { id: c[1]?.replaceAll("`", "") ?? "", types: [...types(c[4]), ...types(c[6])] };
  });

describe(`契約と実装（${strict ? "厳格" : "未実装は警告のみ"}）`, () => {
  it.each(Object.keys(api))("api.%s の処理", (name) => {
    const file = `src/server/handlers/${name}.ts`;
    const index = existsSync("src/server/handlers/index.ts")
      ? readFileSync("src/server/handlers/index.ts", "utf8")
      : "";
    const ok = existsSync(file) && new RegExp(`default as ${name}\\b`).test(index);
    check(ok, `${file} がない（または src/server/handlers/index.ts から export していない）`);
  });

  it.each(rows.map((r) => r.id))("画面 %s のファイル", (id) => {
    check(existsSync(`src/app/${id}/index.tsx`), `src/app/${id}/index.tsx がない`);
  });

  const flow = readFileSync("src/lib/flow.tsx", "utf8");
  const flowTypes = [...new Set(rows.flatMap((r) => r.types))];
  it.each(flowTypes)("画面間で受け渡す %s が useFlow にある", (t) => {
    check(
      new RegExp(`\\b${t}\\b`).test(flow),
      `src/lib/flow.tsx に ${t} の受け渡しの欄がない（screens.md の受け取る / 渡す）`,
    );
  });
});

// モックの固定データが、契約の型に合っているか（型だけでなく実行時にも確かめる）
describe("fixtures が api の応答の型に合う", () => {
  it.each(Object.keys(api).filter((n) => n !== "health"))("%s", (name) => {
    type Schema = { safeParse(v: unknown): { success: boolean } };
    const def = api[name as keyof typeof api] as { res: Schema; chunk?: Schema };
    // 空の状態では fixtures に何も無く型が never になるので、読み取り用の形に広げる
    const fx = (fixtures as Record<string, unknown>)[name] as { chunks?: unknown[]; res?: unknown } | undefined;
    expect(fx, `contracts/fixtures.ts に ${name} がない`).toBeDefined();
    const res = fx && "chunks" in fx ? fx.res : fx;
    expect(def.res.safeParse(res).success, `${name} の fixture が res の型に合わない`).toBe(true);
    if (fx?.chunks && def.chunk) for (const c of fx.chunks) expect(def.chunk.safeParse(c).success).toBe(true);
  });
  it("health 以外は fixtures にある", () =>
    expect(Object.keys(api).filter((n) => n !== "health" && !(n in fixtures))).toEqual([]));
});

// 締め切り（kit.config.json の deadlines）の書き間違いを止める。npm run now / kit:alarm / kit:deadlines が黙って読み飛ばさないように
type Item = { id: string; what: string; owner: string | string[]; priority: string; by?: string };
type Deadline = { id: string; at: string; name: string; items?: Item[] };
describe("kit.config.json の締め切り", () => {
  const deadlines = (cfg as unknown as { deadlines?: Deadline[] }).deadlines ?? [];
  const memberIds = cfg.members.map((m) => m.id);
  it("締め切りの id が重ならず、時刻が読める", () => {
    expect(new Set(deadlines.map((d) => d.id)).size).toBe(deadlines.length);
    for (const d of deadlines) expect(Number.isFinite(Date.parse(d.at)), `${d.id} の at`).toBe(true);
  });
  it.each(deadlines.flatMap((d) => (d.items ?? []).map((i) => [`${d.id}/${i.id}`, d, i] as const)))(
    "%s",
    (_key, d, i) => {
      expect(["must", "should", "nice"], "priority は must / should / nice").toContain(i.priority);
      for (const o of [i.owner].flat()) expect([...memberIds, "all"], `owner ${o} が members にない`).toContain(o);
      if (i.by) expect(Date.parse(i.by) <= Date.parse(d.at), `by（${i.by}）が締め切りより後`).toBe(true);
      expect((d.items ?? []).filter((x) => x.id === i.id).length, "item の id が重なっている").toBe(1);
    },
  );
});
