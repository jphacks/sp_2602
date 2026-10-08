// npm run kit:stub — 契約を足したら lead が実行する。契約にあって中身がない API と画面に「仮のファイル」を作る。
//   仮の API : MOCK でも本番でも contracts/fixtures.ts の同名データを返す（なければ「未実装」エラー）
//   仮の画面 : 「準備中」と出すだけ
// 仮のファイルは 1 行目に KIT-STUB の印があり、所有者でない lead でもコミットできる（check-scope の例外）。
// 本物に置き換える担当者は、その印の行ごと書き換える。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gaps, STUB_MARK } from "./lib/gaps.mjs";
import { p } from "./lib/kit.mjs";

const g = gaps();
const made = [];

for (const r of g.routes) {
  const body =
    r.kind === "stream"
      ? `${STUB_MARK}: 契約と一緒に lead が置いた仮の API。担当者が本物に置き換えるときはこの行ごと書き換える。
import { fixtures } from "@contracts/fixtures";
import { AppError } from "@/server/errors";
import { handleStream } from "@/server/route";

export const ${r.method} = handleStream("${r.name}", async (_req, emit) => {
  const f = (fixtures as Record<string, { chunks?: unknown[]; res?: unknown } | undefined>).${r.name};
  if (!f?.res) throw new AppError("internal", "まだ実装されていません（仮の API）");
  for (const c of f.chunks ?? []) emit(c as never);
  return f.res as never;
});
`
      : `${STUB_MARK}: 契約と一緒に lead が置いた仮の API。担当者が本物に置き換えるときはこの行ごと書き換える。
import { fixtures } from "@contracts/fixtures";
import { AppError } from "@/server/errors";
import { handle } from "@/server/route";

export const ${r.method} = handle("${r.name}", async () => {
  const f = (fixtures as Record<string, unknown>).${r.name};
  if (f === undefined) throw new AppError("internal", "まだ実装されていません（仮の API）");
  return f as never;
});
`;
  mkdirSync(dirname(p(r.file)), { recursive: true });
  writeFileSync(p(r.file), body);
  made.push(`${r.file}（api.${r.name}）`);
}

for (const s of g.pages) {
  mkdirSync(dirname(p(s.file)), { recursive: true });
  writeFileSync(
    p(s.file),
    `${STUB_MARK}: 契約と一緒に lead が置いた仮の画面。担当者が本物に置き換えるときはこの行ごと書き換える。
export default function Page() {
  return <p className="text-muted">「${s.id}」は準備中です</p>;
}
`,
  );
  made.push(`${s.file}（画面 ${s.id}）`);
}

if (made.length) console.log(`✓ 仮のファイルを作った:\n  ${made.join("\n  ")}`);
else console.log("✓ 契約にあって中身がない API・画面はない");

if (g.flow.length) {
  console.log(
    `\n! src/lib/flow.tsx に受け渡しの欄がない型: ${g.flow.join(", ")}\n  → screens.md の「受け取る / 渡す」に書いた型は useFlow() に欄を足す（lead）`,
  );
  process.exitCode = 1;
}
if (made.length)
  console.log(
    "\n契約の PR に一緒に入れる（npm run check → commit）。fixtures に同名のデータがあると仮の API がそれを返す。",
  );
