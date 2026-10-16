// npm run api -- <API名> ['<JSON>' | --body-file <path>] [--base http://localhost:3000]
// 動いているサーバ（npm run dev:server）の API を、contracts/api.ts の名前で1回呼んで結果を表示する（動作確認・模擬の利用者・計測用）。
// curl を使わない理由: Windows の Git Bash の curl は日本語の本文が文字化けし、検証で弾かれる（リハーサル3で3人）。
// node の fetch は常に UTF-8 で送る。stream の API は届いた行を順に出す。
//   例: npm run api -- health
//       npm run api -- rulesGet '{"childId":"demo-child"}'
//       npm run api -- rulesSave --body-file body.json
import { readFileSync } from "node:fs";
import { p } from "./lib/kit.mjs";

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const [name, inline] = args.filter((a, i) => !a.startsWith("--") && !["--base", "--body-file"].includes(args[i - 1]));
const base = opt("--base") ?? `http://localhost:${process.env.PORT ?? 3000}`;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
if (!name) fail("使い方: npm run api -- <API名> ['<JSON>' | --body-file <path>] [--base http://localhost:3000]");

// contracts/api.ts から名前・kind・method・path を読む（TS を実行せずに、表の行を読む）
const src = readFileSync(p("contracts/api.ts"), "utf8");
const block = new RegExp(`\\b${name}:\\s*\\{([^}]*?)path:\\s*"([^"]+)"`, "s").exec(src);
if (!block) {
  const names = [...src.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]);
  fail(`contracts/api.ts に ${name} がない（${names.join(", ")}）`);
}
const kind = /kind:\s*"(\w+)"/.exec(block[0])?.[1] ?? "json";
const method = /method:\s*"(\w+)"/.exec(block[0])?.[1] ?? "POST";
const path = block[2];

let body;
if (opt("--body-file")) body = readFileSync(opt("--body-file"), "utf8");
else if (inline) body = inline;
if (body !== undefined) {
  try {
    JSON.parse(body);
  } catch (e) {
    fail(`本文が JSON として読めない: ${e.message}`);
  }
}

const started = Date.now();
let res;
try {
  res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json; charset=utf-8" },
    body: method === "GET" ? undefined : (body ?? "{}"),
  });
} catch (e) {
  fail(`${base} につながらない（npm run dev / start は起動している？）: ${e.message}`);
}
console.log(`${method} ${path} → ${res.status}（${Date.now() - started}ms）`);
if (kind === "stream" && res.body) {
  // ストリームは HTTP 200 を返した後で {"type":"error"} を送ることがある。1行ずつ読んで、error が来たか・done が来ないまま
  // 終わったら失敗にする（HTTP の状態だけで決めると、処理の失敗を成功と見間違える: レビュー指摘）
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      process.stdout.write(value);
      buffer += value;
    }
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const l of lines.filter((s) => s.trim())) {
      try {
        last = JSON.parse(l).type ?? last;
      } catch {}
      if (last === "error") break;
    }
    if (done || last === "error") break;
  }
  if (res.ok && last !== "done")
    fail(last === "error" ? "ストリームの途中で失敗した（上の error を読む）" : "ストリームが done を送らずに終わった");
} else {
  const text = await res.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}
process.exit(res.ok ? 0 : 1);
