// セキュリティテスト計画（SECURITY_TEST/ANDROID_SECURITY_TEST_PLAN.md）のうち、サーバの API で確かめられるもの:
//   A（API-01〜12）・PII-01〜03・PII-07・PII-08・PII-09・IPA-01〜03・IPA-12（の API 部分）。結果は SECURITY_TEST/RESULTS_API_AUTHZ.md。
// 調べる役のテスト。アプリのコードは変えない。期待どおりでないものは期待の形で書き、it.fails で「今は穴がある」と残す
// （直ったら it.fails が失敗するので、そのときに it へ戻す）。
// 安全のルール（計画 3 章）:
//   - サーバはプロセスの中（Hono の app.request）。DB はメモリ上の PGlite。MOCK=1。ネットワークにはつながない（HTTP サーバも立てない）
//   - アカウントは MOCK のログイン（idToken "mock-new-…"）で作った架空の 親A・子A・親B・子B（と、QR のケースで足す架空の人）だけ
//   - 1つのケース（it）で送る「攻撃の要求」は 20 回まで（hit() が数え、超えたら止める）。準備（ログイン・紐づけ・データ作り・確認の読み取り）は数えない
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { api } from "@contracts/api";
import { addDays } from "@contracts/dates";
import { ApiError } from "@contracts/errors";
import { PairStatus, PairTicket, Session } from "@contracts/schemas";
import { type SQL, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/server/app";
import { db } from "@/server/db";
import { clock, fresh, ok } from "../verify/helpers";

// 手元のメモリ上の DB・MOCK=1 でだけ走らせる（外の DB には決してつながない）
if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR || process.env.MOCK !== "1")
  throw new Error("このテストは MOCK=1・メモリ上の PGlite でだけ走らせる（DATABASE_URL・LOCAL_DB_DIR は空にする）");

const NOW = "2026-10-15T03:00:00Z"; // 日本時間 2026-10-15 12:00
const TODAY = "2026-10-15";
const LIMIT = 20;
const allOn = { usageAccess: true, overlay: true, notifications: true, accessibility: true };
const allOff = { usageAccess: false, overlay: false, notifications: false, accessibility: false };

let sent = 0;
beforeEach(async () => {
  sent = 0;
  await fresh(NOW, { seed: false }); // デモの3人は入れない（このファイルで作った架空の人だけ）
});

// ── 要求を送る道具 ──

const routeByPath = new Map<string, { method: string; auth: string }>(
  Object.values(api).map((r) => [r.path, { method: r.method, auth: r.auth }]),
);
const bearer = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

// 準備用（数えない）。method は契約の表から決める
function send(path: string, body: unknown, token: string | null): Promise<Response> {
  const method = routeByPath.get(path)?.method ?? "POST";
  if (method === "GET") return Promise.resolve(app.request(path, { headers: bearer(token) }));
  return Promise.resolve(
    app.request(path, {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...bearer(token) },
    }),
  );
}

function count() {
  sent += 1;
  if (sent > LIMIT) throw new Error(`1つのケースで送る要求が ${LIMIT} 回を超えた（計画 3 章の上限）`);
}

// 攻撃の要求（数える）
function hit(path: string, body: unknown, token: string | null): Promise<Response> {
  count();
  return send(path, body, token);
}
// 攻撃の要求（数える）。ヘッダー・method・本文を自分で決める
function hitRaw(path: string, init: RequestInit): Promise<Response> {
  count();
  return Promise.resolve(app.request(path, init));
}

// ── 架空のアカウントと家族 ──

const login = async (tag: string): Promise<Session> =>
  Session.parse(await ok(send("/api/auth/google", { idToken: `mock-new-${tag}` }, null)));

// 子どもが QR を出し（呼び名 name）、保護者が読み、子どもが「はい」で確定する
async function pairUp(child: Session, parent: Session, name: string) {
  const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name }, child.token)));
  await ok(send("/api/pair/claim", { code: ticket.code }, parent.token));
  PairStatus.parse(await ok(send("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, child.token)));
  return ticket.pairId;
}

const version = async (childId: string, token: string) =>
  (await ok<{ configVersion: number }>(send("/api/plan/get", { childId }, token))).configVersion;

// PNG の頭だけをもつ小さなアイコン（サーバは PNG の頭・大きさ・ハッシュだけを確かめる）
function pngIcon(seed: string) {
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`sectest-${seed}`),
  ]);
  return { png: bytes.toString("base64"), iconHash: createHash("sha256").update(bytes).digest("hex") };
}

const usageDay = (date: string, measuredAt: string, pkg: string, label: string, minutes: number) => ({
  date,
  measuredAt,
  restrictedMinutes: minutes,
  apps: [{ packageName: pkg, label, usedMinutes: minutes, excluded: false }],
});

type Family = {
  letter: "A" | "B";
  parent: Session;
  child: Session;
  pairId: string;
  mark: string; // 子どもの呼び名・テスト期間・空白期間・アプリ名に入れた見分け用の文字
  childName: string;
  pkg: string;
  appLabel: string;
  minutes: number;
  site: string;
  submissionId: string;
  testPeriodId: string;
  blankPeriodId: string;
};

type FamilyOpts = { childName?: string; pkg?: string; appLabel?: string; minutes?: number };

// 親X↔子X を作り、子どもの端末から（利用記録・アプリ一覧・アイコン・許可の状態）と、保護者から（通常上限・テスト期間・
// 空白期間・対象外アプリ・制限する Web サイト）のデータを1つずつ入れる。どれも家族ごとに違う見分け用の文字を入れる
async function makeFamily(letter: "A" | "B", opts: FamilyOpts = {}): Promise<Family> {
  const mark = `しるし${letter.repeat(3)}`;
  const parent = await login(`secplan-PAR${letter}`); // 名前は「はじめての人（PARA）」の形
  const child = await login(`secplan-KID${letter}`);
  const childName = opts.childName ?? `子${letter}_${mark}`;
  const pairId = await pairUp(child, parent, childName);
  const word = letter === "A" ? "alpha" : "bravo";
  const pkg = opts.pkg ?? `com.sectest.${word}`;
  const appLabel = opts.appLabel ?? `アプリ${letter}_${mark}`;
  const minutes = opts.minutes ?? (letter === "A" ? 30 : 45);
  const childId = child.userId;
  const icon = pngIcon(letter);
  const submissionId = randomUUID();
  await ok(
    send(
      "/api/usage/upload",
      { submissionId, childId, days: [usageDay(TODAY, "2026-10-15T02:00:00.000Z", pkg, appLabel, minutes)] },
      child.token,
    ),
  );
  await ok(
    send(
      "/api/child-apps/upload",
      { childId, apps: [{ packageName: pkg, label: appLabel, iconHash: icon.iconHash }] },
      child.token,
    ),
  );
  await ok(send("/api/child-apps/icons/upload", { childId, icons: [{ packageName: pkg, ...icon }] }, child.token));
  await ok(
    send(
      "/api/device-status/report",
      { childId, permissions: allOn, measuredAt: "2026-10-15T02:30:00.000Z" },
      child.token,
    ),
  );
  let v = await version(childId, parent.token);
  v = (
    await ok<{ configVersion: number }>(
      send(
        "/api/plan/usual-limit",
        { childId, expectedVersion: v, usualLimitMinutes: letter === "A" ? 90 : 120 },
        parent.token,
      ),
    )
  ).configVersion;
  const tp = await ok<{ testPeriod: { id: string }; configVersion: number }>(
    send(
      "/api/test-period/create",
      { childId, expectedVersion: v, name: `テスト${letter}_${mark}`, startDate: "2026-11-02", endDate: "2026-11-03" },
      parent.token,
    ),
  );
  const bp = await ok<{ blankPeriod: { id: string }; configVersion: number }>(
    send(
      "/api/blank-period/create",
      {
        childId,
        expectedVersion: tp.configVersion,
        name: `休み${letter}_${mark}`,
        startDate: "2026-12-24",
        endDate: "2026-12-26",
      },
      parent.token,
    ),
  );
  const ex = await ok<{ configVersion: number }>(
    send(
      "/api/excluded-apps/save",
      { childId, expectedVersion: bp.configVersion, apps: [{ packageName: pkg, label: appLabel }] },
      parent.token,
    ),
  );
  const site = `${word}-sectest.com`;
  await ok(
    send("/api/blocked-sites/save", { childId, expectedVersion: ex.configVersion, sites: [site] }, parent.token),
  );
  return {
    letter,
    parent,
    child,
    pairId,
    mark,
    childName,
    pkg,
    appLabel,
    minutes,
    site,
    submissionId,
    testPeriodId: tp.testPeriod.id,
    blankPeriodId: bp.blankPeriod.id,
  };
}

async function twoFamilies(optsA: FamilyOpts = {}, optsB: FamilyOpts = {}) {
  const a = await makeFamily("A", optsA);
  const b = await makeFamily("B", optsB);
  return { a, b };
}

// その家族を見分ける値（ほかの家族への応答に1つでも入っていたら漏れ）。合言葉も入れる
const secretsOf = (f: Family): [string, string][] => [
  [`子${f.letter}の userId`, f.child.userId],
  [`親${f.letter}の userId`, f.parent.userId],
  [`子${f.letter}の合言葉`, f.child.token],
  [`親${f.letter}の合言葉`, f.parent.token],
  [`親${f.letter}の名前`, `PAR${f.letter}`],
  [`家族${f.letter}の見分けの文字`, f.mark],
  [`家族${f.letter}の Web サイト`, f.site],
  [`家族${f.letter}の送信 ID`, f.submissionId],
  [`家族${f.letter}のテスト期間 id`, f.testPeriodId],
  [`家族${f.letter}の空白期間 id`, f.blankPeriodId],
  [`家族${f.letter}のペアリング id`, f.pairId],
];

function expectNoLeak(text: string, f: Family, where: string, skip: string[] = []) {
  for (const [label, value] of secretsOf(f)) {
    if (skip.includes(label)) continue;
    expect(text.includes(value), `${where} の応答に ${label} が入っている`).toBe(false);
  }
}

// 失敗の応答: status・code が合い、本文は ApiError の3項目だけで、例外・SQL・スタックを含まない
async function expectError(res: Response, status: number, code: string, where: string): Promise<string> {
  const text = await res.text();
  expect(res.status, `${where}: ${text}`).toBe(status);
  const body = ApiError.parse(JSON.parse(text));
  expect(body.code, where).toBe(code);
  // bad_request だけは、どの項目が違うか（issues: 項目の名前と文）を返す（契約 contracts/errors.ts）。ほかは3項目だけ
  const allowed = code === "bad_request" ? ["code", "hint", "issues", "message"] : ["code", "hint", "message"];
  for (const key of Object.keys(body)) expect(allowed, `${where}: 余計な項目 ${key}`).toContain(key);
  expect(text, where).not.toMatch(
    /stack|\bat .+\.(ts|js):\d+|Error:|SyntaxError|ZodError|select |insert |postgres|drizzle|pglite|invalid input syntax|\$1/i,
  );
  return text;
}

// ── DB の中身（拒否のあとに変わっていないかを比べる）──

type Rows = Record<string, string[]>;
async function rows(query: SQL): Promise<Record<string, unknown>[]> {
  const res = (await (await db()).execute(query)) as unknown as { rows: Record<string, unknown>[] };
  return res.rows;
}
// その家族の、子どもの id をもつすべての表の行・2人の users の行・つながり・合言葉の取り消し状態
async function dump(f: Family): Promise<Rows> {
  const tables = await rows(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'child_id' order by table_name`,
  );
  const out: Rows = {};
  const sorted = (list: Record<string, unknown>[]) => list.map((r) => JSON.stringify(r)).sort();
  for (const t of tables) {
    const name = String(t.table_name);
    out[name] = sorted(await rows(sql`select * from ${sql.identifier(name)} where child_id = ${f.child.userId}`));
  }
  out.users = sorted(
    await rows(sql`select * from users where id in (${f.child.userId}, ${f.parent.userId}) order by id`),
  );
  out.family_links_all = sorted(
    await rows(
      sql`select parent_id, child_id from family_links where parent_id in (${f.child.userId}, ${f.parent.userId}) or child_id in (${f.child.userId}, ${f.parent.userId})`,
    ),
  );
  out.sessions = sorted(
    await rows(
      sql`select user_id, revoked_at, expires_at from user_sessions where user_id in (${f.child.userId}, ${f.parent.userId})`,
    ),
  );
  return out;
}

// ── 保護対象の API ごとの本文（f の家族の値を入れる。拒否されなければ f のデータを読める・変えられる本文）──

const takeover = { name: "のっとり", startDate: "2026-11-10", endDate: "2026-11-11" };
function bodyFor(path: string, f: Family, v: number): unknown {
  const childId = f.child.userId;
  const table: Record<string, unknown> = {
    "/api/auth/me": undefined,
    "/api/auth/sign-out": {},
    "/api/pair/start": {},
    "/api/pair/status": { pairId: f.pairId },
    "/api/pair/claim": { code: "0".repeat(40) },
    "/api/pair/confirm": { pairId: f.pairId, accept: true },
    "/api/pair/cancel": { pairId: f.pairId },
    "/api/link/status": undefined,
    "/api/family/get": undefined,
    "/api/family/unlink": { childId },
    "/api/plan/get": { childId },
    "/api/plan/save": {
      childId,
      expectedVersion: v,
      planStartDate: TODAY,
      startLimitMinutes: 200,
      finalGoalMinutes: 100,
    },
    "/api/plan/usual-limit": { childId, expectedVersion: v, usualLimitMinutes: 5 },
    "/api/test-period/list": { childId },
    "/api/test-period/create": { childId, expectedVersion: v, ...takeover },
    "/api/test-period/update": { childId, expectedVersion: v, id: f.testPeriodId, ...takeover },
    "/api/test-period/delete": { childId, expectedVersion: v, id: f.testPeriodId },
    "/api/blank-period/list": { childId },
    "/api/blank-period/create": { childId, expectedVersion: v, ...takeover },
    "/api/blank-period/update": { childId, expectedVersion: v, id: f.blankPeriodId, ...takeover },
    "/api/blank-period/delete": { childId, expectedVersion: v, id: f.blankPeriodId },
    "/api/config/get": { childId },
    "/api/usage/upload": {
      submissionId: randomUUID(),
      childId,
      days: [usageDay(TODAY, "2026-10-15T02:40:00.000Z", "com.sectest.evil", "のっとり", 600)],
    },
    "/api/usage/get": { childId, from: TODAY, to: TODAY },
    "/api/excluded-apps/get": { childId },
    "/api/excluded-apps/save": { childId, expectedVersion: v, apps: [] },
    "/api/blocked-sites/get": { childId },
    "/api/blocked-sites/save": { childId, expectedVersion: v, sites: [] },
    "/api/child-apps/upload": { childId, apps: [] },
    "/api/child-apps/icons/upload": { childId, icons: [{ packageName: f.pkg, ...pngIcon("evil") }] },
    "/api/child-apps/get": { childId },
    "/api/child-apps/icons/get": { childId, packageNames: [f.pkg] },
    "/api/device-status/report": { childId, permissions: allOff, measuredAt: "2026-10-15T02:50:00.000Z" },
    "/api/device-status/get": { childId },
  };
  if (!(path in table)) throw new Error(`本文の見本がない: ${path}`);
  return table[path];
}

// API-01 は個人データを読む API と危ない書く API の 20 本、API-08 は残りの 14 本（合わせて保護対象の全部。下のテストで確かめる）
const API01_PATHS = [
  "/api/auth/me",
  "/api/link/status",
  "/api/family/get",
  "/api/pair/status",
  "/api/plan/get",
  "/api/test-period/list",
  "/api/blank-period/list",
  "/api/config/get",
  "/api/usage/get",
  "/api/excluded-apps/get",
  "/api/blocked-sites/get",
  "/api/child-apps/get",
  "/api/child-apps/icons/get",
  "/api/device-status/get",
  "/api/plan/save",
  "/api/usage/upload",
  "/api/family/unlink",
  "/api/pair/claim",
  "/api/pair/confirm",
  "/api/auth/sign-out",
];
const API08_PATHS = [
  "/api/pair/start",
  "/api/pair/cancel",
  "/api/plan/usual-limit",
  "/api/test-period/create",
  "/api/test-period/update",
  "/api/test-period/delete",
  "/api/blank-period/create",
  "/api/blank-period/update",
  "/api/blank-period/delete",
  "/api/excluded-apps/save",
  "/api/blocked-sites/save",
  "/api/child-apps/upload",
  "/api/child-apps/icons/upload",
  "/api/device-status/report",
];
// 子どもの id を入力にもち、保護者が読む API（API-04）・書く API（API-05）
const CHILD_READS = [
  "/api/plan/get",
  "/api/test-period/list",
  "/api/blank-period/list",
  "/api/config/get",
  "/api/usage/get",
  "/api/excluded-apps/get",
  "/api/blocked-sites/get",
  "/api/child-apps/get",
  "/api/child-apps/icons/get",
  "/api/device-status/get",
];
const PARENT_WRITES = [
  "/api/plan/save",
  "/api/plan/usual-limit",
  "/api/test-period/create",
  "/api/test-period/update",
  "/api/test-period/delete",
  "/api/blank-period/create",
  "/api/blank-period/update",
  "/api/blank-period/delete",
  "/api/excluded-apps/save",
  "/api/blocked-sites/save",
  "/api/family/unlink",
];

// ══════════════════════════════════════════════════════════════════════
// A. 認証・認可・API 列挙
// ══════════════════════════════════════════════════════════════════════

describe("A. 認証・認可・API 列挙", () => {
  it("API-01/API-08 の対象を合わせると、契約の保護対象（auth が none 以外）の API が重なりなく全部入る", () => {
    const protectedPaths = Object.values(api)
      .filter((r) => r.auth !== "none")
      .map((r) => r.path)
      .sort();
    expect([...API01_PATHS, ...API08_PATHS].sort()).toEqual(protectedPaths);
    expect(new Set([...API01_PATHS, ...API08_PATHS]).size).toBe(protectedPaths.length);
  });

  it("API-01 合言葉なしで保護対象の API（個人データを読む14本・危ない書く6本）を呼ぶと、すべて 401 で個人データを返さず、DB も変わらない", async () => {
    const { a } = await twoFamilies();
    const v = await version(a.child.userId, a.parent.token);
    const before = await dump(a);
    for (const path of API01_PATHS) {
      const text = await expectError(await hit(path, bodyFor(path, a, v), null), 401, "unauthorized", path);
      expectNoLeak(text, a, path);
    }
    expect(await dump(a)).toEqual(before);
  });

  it("API-02 空・形の違う・壊れた・偽の・1文字違い・取り消し済み・期限切れの合言葉は 401 で、送った合言葉や例外を返さない", async () => {
    const { a } = await twoFamilies();
    const real = a.parent.token;
    const flipped = `${real.slice(0, -1)}${real.endsWith("A") ? "B" : "A"}`;
    const forged = randomBytes(32).toString("base64url");
    const jwtLike = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.";
    const cases: [string, string][] = [
      ["空の Bearer", "Bearer "],
      ["Bearer だけ", "Bearer"],
      ["Basic 方式", `Basic ${Buffer.from("parent:password").toString("base64")}`],
      ["壊れた形", `Bearer ${"%%<script>'\"".repeat(8)}`],
      ["偽の乱数の合言葉", `Bearer ${forged}`],
      ["署名なしの JWT の形", `Bearer ${jwtLike}`],
      ["本物の1文字違い", `Bearer ${flipped}`],
    ];
    for (const [label, header] of cases) {
      const res = await hitRaw("/api/usage/get", {
        method: "POST",
        body: JSON.stringify({ childId: a.child.userId, from: TODAY, to: TODAY }),
        headers: { "Content-Type": "application/json", Authorization: header },
      });
      const text = await expectError(res, 401, "unauthorized", label);
      const sentToken = header.replace(/^\S+\s?/, "");
      if (sentToken.length > 0)
        expect(text.includes(sentToken), `${label}: 送った合言葉が応答に入っている`).toBe(false);
      expectNoLeak(text, a, label);
    }
    // URL の引数で合言葉を渡しても受け付けない（合言葉を URL に出させない）
    const query = await hitRaw(
      `/api/auth/me?token=${encodeURIComponent(real)}&access_token=${encodeURIComponent(real)}`,
      {},
    );
    expectNoLeak(await expectError(query, 401, "unauthorized", "URL の引数"), a, "URL の引数");
    // 取り消し済み（ログアウトした別の端末の合言葉）
    const other = await login("secplan-PARA");
    expect(other.userId).toBe(a.parent.userId);
    await ok(app.request("/api/auth/sign-out", { method: "POST", headers: bearer(other.token) }));
    const revoked = await hit("/api/auth/me", undefined, other.token);
    const revokedText = await expectError(revoked, 401, "unauthorized", "取り消し済み");
    expect(revokedText.includes(other.token)).toBe(false);
    // 期限切れ（最後に使ってから30日を過ぎた）
    clock.addMs(30 * 86_400_000 + 60_000);
    const expired = await hit("/api/auth/me", undefined, real);
    expect((await expectError(expired, 401, "unauthorized", "期限切れ")).includes(real)).toBe(false);
  });

  it("API-03 子Aの合言葉で保護者向けの設定変更 API（自分の childId）を呼ぶと 403 で、設定もつながりも変わらない", async () => {
    const { a } = await twoFamilies();
    const v = await version(a.child.userId, a.parent.token);
    const before = await dump(a);
    const paths = [
      "/api/plan/save",
      "/api/plan/usual-limit",
      "/api/blank-period/create",
      "/api/blank-period/update",
      "/api/blank-period/delete",
      "/api/excluded-apps/save",
      "/api/blocked-sites/save",
      "/api/family/unlink",
    ];
    for (const path of paths) {
      await expectError(await hit(path, bodyFor(path, a, v), a.child.token), 403, "forbidden", path);
    }
    expect(await dump(a)).toEqual(before);
    expect(await version(a.child.userId, a.parent.token)).toBe(v);
  });

  it("API-04 親Aが子Bの利用記録・設定・アプリ一覧・アイコン・端末の状態を読むと、すべて 403 で子Bのデータが入らない", async () => {
    const { a, b } = await twoFamilies();
    const v = await version(b.child.userId, b.parent.token);
    const before = await dump(b);
    for (const path of CHILD_READS) {
      const text = await expectError(await hit(path, bodyFor(path, b, v), a.parent.token), 403, "forbidden", path);
      expectNoLeak(text, b, path, ["子Bの userId"]); // 送った childId そのものは除く（応答に出ていないことは下で確かめる）
      expect(text.includes(b.child.userId), `${path}: 送った子Bの id を応答で返している`).toBe(false);
    }
    expect(await dump(b)).toEqual(before);
  });

  it("API-05 親Aが子Bの id で書く（11本）と 403、自分の子の id に子Bの期間の id を混ぜると 404。どちらの家族の DB も変わらない", async () => {
    const { a, b } = await twoFamilies();
    const vB = await version(b.child.userId, b.parent.token);
    const vA = await version(a.child.userId, a.parent.token);
    const beforeA = await dump(a);
    const beforeB = await dump(b);
    for (const path of PARENT_WRITES) {
      const text = await expectError(await hit(path, bodyFor(path, b, vB), a.parent.token), 403, "forbidden", path);
      expectNoLeak(text, b, path);
    }
    const mixed: [string, unknown][] = [
      ["/api/test-period/update", { childId: a.child.userId, expectedVersion: vA, id: b.testPeriodId, ...takeover }],
      ["/api/test-period/delete", { childId: a.child.userId, expectedVersion: vA, id: b.testPeriodId }],
      ["/api/blank-period/update", { childId: a.child.userId, expectedVersion: vA, id: b.blankPeriodId, ...takeover }],
      ["/api/blank-period/delete", { childId: a.child.userId, expectedVersion: vA, id: b.blankPeriodId }],
    ];
    for (const [path, body] of mixed) {
      const text = await expectError(await hit(path, body, a.parent.token), 404, "not_found", `${path}（id を混ぜる）`);
      expectNoLeak(text, b, path);
    }
    expect(await dump(b)).toEqual(beforeB);
    expect(await dump(a)).toEqual(beforeA);
  });

  it("API-06 子Aが childId を子Bにして利用記録・アプリ一覧・アイコン・端末の状態・テスト期間を送ると 403 で、子Bの DB は変わらない", async () => {
    const { a, b } = await twoFamilies();
    const vB = await version(b.child.userId, b.parent.token);
    const beforeA = await dump(a);
    const beforeB = await dump(b);
    const paths = [
      "/api/usage/upload",
      "/api/child-apps/upload",
      "/api/child-apps/icons/upload",
      "/api/device-status/report",
      "/api/test-period/create",
      "/api/test-period/update",
      "/api/test-period/delete",
      "/api/config/get", // 子どもが呼ぶと「子どもの端末が使っている版」を書くので、書く操作として扱う
    ];
    for (const path of paths) {
      const text = await expectError(await hit(path, bodyFor(path, b, vB), a.child.token), 403, "forbidden", path);
      expectNoLeak(text, b, path);
    }
    expect(await dump(b)).toEqual(beforeB);
    expect(await dump(a)).toEqual(beforeA);
  });

  it("API-07 本文の role・userId・parentId・createdByUserId・createdByRole を書き換えても、サーバの値が使われる", async () => {
    const { a, b } = await twoFamilies();
    const beforeB = await dump(b);
    // ログインの本文に role・userId を混ぜても、はじめての人（role: null）として新しく作る
    const fake = Session.parse(
      await ok(
        hit(
          "/api/auth/google",
          { idToken: "mock-new-secplan-ROLE", role: "parent", userId: a.parent.userId, parentId: a.parent.userId },
          null,
        ),
      ),
    );
    expect(fake.role).toBeNull();
    expect(fake.userId).not.toBe(a.parent.userId);
    // その人が role: parent と言っても、子Aのデータは読めない
    await expectError(
      await hit("/api/plan/get", { childId: a.child.userId, role: "parent", parentId: a.parent.userId }, fake.token),
      403,
      "forbidden",
      "role: null の人が role を名乗る",
    );
    // 子Aが保護者だけの操作に role・parentId を混ぜても 403
    const vA = await version(a.child.userId, a.parent.token);
    await expectError(
      await hit(
        "/api/plan/usual-limit",
        {
          childId: a.child.userId,
          expectedVersion: vA,
          usualLimitMinutes: 1440,
          role: "parent",
          parentId: a.parent.userId,
        },
        a.child.token,
      ),
      403,
      "forbidden",
      "子Aが role: parent を名乗る",
    );
    // 子Aがテスト期間を作るときに「保護者が作った」と書いても、作った人は子A
    const created = await ok<{ testPeriod: { id: string; createdByUserId: string; createdByRole: string } }>(
      hit(
        "/api/test-period/create",
        {
          childId: a.child.userId,
          expectedVersion: vA,
          name: "子が作った",
          startDate: "2026-11-20",
          endDate: "2026-11-20",
          createdByUserId: a.parent.userId,
          createdByRole: "parent",
          role: "parent",
        },
        a.child.token,
      ),
    );
    expect(created.testPeriod).toMatchObject({ createdByUserId: a.child.userId, createdByRole: "child" });
    const [row] = await rows(sql`select created_by_user_id from test_periods where id = ${created.testPeriod.id}`);
    expect(row?.created_by_user_id).toBe(a.child.userId);
    // 子Aの利用記録に userId・parentId（家族B）を混ぜても、保存先は子Aだけ
    await ok(
      hit(
        "/api/usage/upload",
        {
          submissionId: randomUUID(),
          childId: a.child.userId,
          userId: b.child.userId,
          parentId: b.parent.userId,
          role: "parent",
          days: [usageDay(TODAY, "2026-10-15T02:45:00.000Z", a.pkg, a.appLabel, 33)],
        },
        a.child.token,
      ),
    );
    // 親Aの計画の保存に parentId（親B）を混ぜても、家族Bには何も起きない
    const vA2 = await version(a.child.userId, a.parent.token);
    await ok(
      hit(
        "/api/plan/save",
        {
          childId: a.child.userId,
          expectedVersion: vA2,
          planStartDate: TODAY,
          startLimitMinutes: 200,
          finalGoalMinutes: 100,
          parentId: b.parent.userId,
          userId: b.parent.userId,
        },
        a.parent.token,
      ),
    );
    // 役割とつながりはサーバの DB のまま
    expect((await ok<{ role: string }>(send("/api/auth/me", undefined, a.child.token))).role).toBe("child");
    expect((await ok<{ role: string }>(send("/api/auth/me", undefined, a.parent.token))).role).toBe("parent");
    const links = await rows(sql`select parent_id, child_id from family_links order by parent_id`);
    expect(links.map((l) => [l.parent_id, l.child_id]).sort()).toEqual(
      [
        [a.parent.userId, a.child.userId],
        [b.parent.userId, b.child.userId],
      ].sort(),
    );
    expect(await dump(b)).toEqual(beforeB);
  });

  it("API-08 health は ok と mock だけを返し、未知の道筋・違う method は 404、残りの保護対象（14本）は合言葉なしで 401", async () => {
    const { a } = await twoFamilies();
    const v = await version(a.child.userId, a.parent.token);
    const health = await hit("/api/health", undefined, null);
    const healthText = await health.text();
    expect(health.status).toBe(200);
    expect(JSON.parse(healthText)).toEqual({ ok: true, mock: true });
    expect(healthText).not.toMatch(/DATABASE_URL|postgres|neon|secret|password|token|GOOGLE|VERCEL|pglite|version/i);
    expect(health.headers.get("x-powered-by")).toBeNull();
    expect(health.headers.get("server")).toBeNull();
    for (const [path, init] of [
      ["/api/no-such-api", {}],
      ["/health", {}], // backend/src/server.ts の道筋は、このアプリの入口にはない
      ["/api/plan/get", { method: "GET" }], // POST の API を GET で呼ぶ
    ] as [string, RequestInit][]) {
      await expectError(await hitRaw(path, init), 404, "not_found", `未知: ${init.method ?? "GET"} ${path}`);
    }
    const before = await dump(a);
    for (const path of API08_PATHS) {
      const text = await expectError(await hit(path, bodyFor(path, a, v), null), 401, "unauthorized", path);
      expectNoLeak(text, a, path);
    }
    expect(await dump(a)).toEqual(before);
  });

  it("API-09 同じ QR を2回読むと2回目は 409、確定後に別の保護者が読んでも 409、期限切れも 409。どれも別の親子を結びつけない", async () => {
    await twoFamilies();
    const kid = await login("secplan-KIDC");
    const p1 = await login("secplan-PARC");
    const p2 = await login("secplan-PARD");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    expect((await hit("/api/pair/claim", { code: ticket.code }, p1.token)).status).toBe(200);
    const second = await expectError(
      await hit("/api/pair/claim", { code: ticket.code }, p2.token),
      409,
      "conflict",
      "2回目の読み取り",
    );
    expect(second).not.toContain(kid.userId);
    await ok(send("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token));
    const afterLinked = await expectError(
      await hit("/api/pair/claim", { code: ticket.code }, p2.token),
      409,
      "conflict",
      "確定後の読み取り",
    );
    expect(afterLinked).not.toContain(kid.userId);
    // 期限切れ
    const kid2 = await login("secplan-KIDE");
    const t2 = PairTicket.parse(await ok(send("/api/pair/start", {}, kid2.token)));
    clock.addMs(10 * 60_000 + 1);
    const expired = await expectError(
      await hit("/api/pair/claim", { code: t2.code }, p2.token),
      409,
      "conflict",
      "期限切れの読み取り",
    );
    expect(expired).not.toContain(kid2.userId);
    // つながりは 親C↔子C だけが増え、親D・子E はどこにもつながらない
    const links = await rows(sql`select parent_id, child_id from family_links`);
    expect(links.filter((l) => l.child_id === kid.userId).map((l) => l.parent_id)).toEqual([p1.userId]);
    expect(links.some((l) => l.parent_id === p2.userId || l.child_id === p2.userId)).toBe(false);
    expect(links.some((l) => l.child_id === kid2.userId)).toBe(false);
    expect((await ok<{ role: string | null }>(send("/api/auth/me", undefined, p2.token))).role).toBeNull();
    expect((await ok<{ role: string | null }>(send("/api/auth/me", undefined, kid2.token))).role).toBeNull();
  });

  it("API-10 QR の読み取りに別の子の id を混ぜても、QR を出した子とだけつながる。ほかの子・関わっていない保護者は確定・取り消しできない", async () => {
    const { a, b } = await twoFamilies();
    const beforeB = await dump(b);
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    const claimed = PairStatus.parse(
      await ok(hit("/api/pair/claim", { code: ticket.code, childId: b.child.userId, pairId: b.pairId }, p.token)),
    );
    expect(claimed.child.id).toBe(kid.userId);
    for (const [label, path, body, token] of [
      ["子Bが子Cの QR を確定", "/api/pair/confirm", { pairId: ticket.pairId, accept: true }, b.child.token],
      ["子Bが子Cの QR を取り消す", "/api/pair/cancel", { pairId: ticket.pairId }, b.child.token],
      ["親Aが子Cの QR を確定", "/api/pair/confirm", { pairId: ticket.pairId, accept: true }, a.parent.token],
    ] as [string, string, unknown, string][]) {
      const text = await expectError(await hit(path, body, token), 404, "not_found", label);
      expect(text).not.toContain(kid.userId);
    }
    await ok(send("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token));
    const status = await ok<{ partners: { userId: string }[] }>(send("/api/link/status", undefined, p.token));
    expect(status.partners.map((x) => x.userId)).toEqual([kid.userId]);
    expect(await dump(b)).toEqual(beforeB);
  });

  it("API-11 紐づけの確定・読み取り・利用記録の送信を同じ本文で再送しても、つながり・記録は1つだけ", async () => {
    await twoFamilies();
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    await ok(send("/api/pair/claim", { code: ticket.code }, p.token));
    const confirm = { pairId: ticket.pairId, accept: true };
    expect((await hit("/api/pair/confirm", confirm, kid.token)).status).toBe(200);
    // 応答を受け取れなかったとして、同じ確定をもう一度送る
    await expectError(await hit("/api/pair/confirm", confirm, kid.token), 409, "conflict", "確定の再送");
    await expectError(await hit("/api/pair/claim", { code: ticket.code }, p.token), 409, "conflict", "読み取りの再送");
    const links = await rows(sql`select parent_id from family_links where child_id = ${kid.userId}`);
    expect(links.map((l) => l.parent_id)).toEqual([p.userId]);
    expect((await ok<{ state: string }>(send("/api/link/status", undefined, kid.token))).state).toBe("linked");
    // 利用記録の再送は duplicate で、記録は1日に1つ
    const upload = {
      submissionId: randomUUID(),
      childId: kid.userId,
      days: [usageDay(TODAY, "2026-10-15T02:10:00.000Z", "com.sectest.charlie", "C", 12)],
    };
    expect((await ok<{ status: string }>(hit("/api/usage/upload", upload, kid.token))).status).toBe("accepted");
    expect((await ok<{ status: string }>(hit("/api/usage/upload", upload, kid.token))).status).toBe("duplicate");
    const reports = await rows(sql`select usage_date from usage_day_reports where child_id = ${kid.userId}`);
    expect(reports).toHaveLength(1);
    const records = await rows(sql`select app_id from usage_records where child_id = ${kid.userId}`);
    expect(records).toHaveLength(1);
  });

  it("API-12 ない id・形の違う id と、あるが権限のない id で、status・本文・大きさが同じ（アカウントや家族の有無が分からない）", async () => {
    const { a, b } = await twoFamilies();
    const vA = await version(a.child.userId, a.parent.token);
    const groups: [string, string, [string, unknown][], string, number][] = [
      [
        "親Aの plan/get",
        "/api/plan/get",
        [
          ["形の違う id", { childId: "not-a-uuid" }],
          ["ない uuid", { childId: randomUUID() }],
          ["子Bの id", { childId: b.child.userId }],
          ["親Bの id", { childId: b.parent.userId }],
        ],
        a.parent.token,
        403,
      ],
      [
        "子Aの plan/get",
        "/api/plan/get",
        [
          ["ない uuid", { childId: randomUUID() }],
          ["子Bの id", { childId: b.child.userId }],
        ],
        a.child.token,
        403,
      ],
      [
        "親Aの test-period/update（自分の子の id）",
        "/api/test-period/update",
        [
          ["ない期間の id", { childId: a.child.userId, expectedVersion: vA, id: randomUUID(), ...takeover }],
          ["子Bの期間の id", { childId: a.child.userId, expectedVersion: vA, id: b.testPeriodId, ...takeover }],
        ],
        a.parent.token,
        404,
      ],
      [
        "親Aの blank-period/delete（自分の子の id）",
        "/api/blank-period/delete",
        [
          ["ない期間の id", { childId: a.child.userId, expectedVersion: vA, id: randomUUID() }],
          ["子Bの期間の id", { childId: a.child.userId, expectedVersion: vA, id: b.blankPeriodId }],
        ],
        a.parent.token,
        404,
      ],
      [
        "親Aの pair/status",
        "/api/pair/status",
        [
          ["ないペアリング", { pairId: randomUUID() }],
          ["家族Bのペアリング", { pairId: b.pairId }],
        ],
        a.parent.token,
        404,
      ],
    ];
    for (const [group, path, variants, token, status] of groups) {
      const texts: string[] = [];
      for (const [label, body] of variants) {
        const res = await hit(path, body, token);
        texts.push(await expectError(res, status, status === 403 ? "forbidden" : "not_found", `${group}: ${label}`));
      }
      expect(new Set(texts).size, `${group}: 本文が同じでない`).toBe(1);
      expect(new Set(texts.map((t) => Buffer.byteLength(t))).size, `${group}: 大きさが同じでない`).toBe(1);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// PII: アカウント／個人情報の漏えい（サーバ側で確かめられる部分）
// ══════════════════════════════════════════════════════════════════════

describe("PII. 個人情報の漏えい（サーバの応答と DB）", () => {
  it("PII-01 親A・子Aが、読める API を全部読んでも、家族Bの id・名前・記録・設定が1つも入らない（自分の家族の分は入る）", async () => {
    const { a, b } = await twoFamilies();
    const parentReads: [string, unknown][] = [
      ["/api/auth/me", undefined],
      ["/api/link/status", undefined],
      ["/api/family/get", undefined],
      ...CHILD_READS.map((path): [string, unknown] => [path, bodyFor(path, a, 0)]),
    ];
    const seen: string[] = [];
    for (const [path, body] of parentReads) {
      const res = await hit(path, body, a.parent.token);
      const text = await res.text();
      expect(res.status, `親A ${path}: ${text}`).toBe(200);
      expectNoLeak(text, b, `親A ${path}`);
      expect(text.includes(a.child.token), `親A ${path} に子Aの合言葉が入っている`).toBe(false);
      seen.push(text);
    }
    // 自分の家族の分は入っている（テストが空振りしていないことの確認）
    const all = seen.join("\n");
    for (const want of [a.child.userId, a.childName, a.appLabel, `テストA_${a.mark}`, `休みA_${a.mark}`, a.site]) {
      expect(all).toContain(want);
    }
    // 子A: 読める API
    for (const [path, body] of [
      ["/api/auth/me", undefined],
      ["/api/link/status", undefined],
      ["/api/config/get", { childId: a.child.userId }],
      ["/api/test-period/list", { childId: a.child.userId }],
      ["/api/excluded-apps/get", { childId: a.child.userId }],
    ] as [string, unknown][]) {
      const res = await hit(path, body, a.child.token);
      const text = await res.text();
      expect(res.status, `子A ${path}: ${text}`).toBe(200);
      expectNoLeak(text, b, `子A ${path}`);
      expect(text.includes(a.parent.token), `子A ${path} に親Aの合言葉が入っている`).toBe(false);
    }
    // 同じ家族でも役割が違う: 子Aは保護者向けの読み取り（利用記録の生データ・家族の一覧）を読めない
    for (const [path, body] of [
      ["/api/usage/get", { childId: a.child.userId, from: TODAY, to: TODAY }],
      ["/api/family/get", undefined],
    ] as [string, unknown][]) {
      await expectError(await hit(path, body, a.child.token), 403, "forbidden", `子A ${path}`);
    }
  });

  it("PII-02 親Aの正しい要求の子の id・日付・送信 ID・アプリ名を家族Bのものに差し替えても、家族Bの行は返らず、集計にも混ざらない", async () => {
    const { a, b } = await twoFamilies();
    const beforeB = await dump(b);
    // 子の id の差し替え
    await expectError(
      await hit("/api/usage/get", { childId: b.child.userId, from: TODAY, to: TODAY }, a.parent.token),
      403,
      "forbidden",
      "利用記録の子の id を子Bに",
    );
    // 日付の範囲を広げる（家族Bにも同じ日の記録がある）→ 子Aの分だけ。合計に子Bの分が足されない
    const wide = await ok<{ days: { date: string; recorded: boolean; usedMinutes: number | null }[] }>(
      hit("/api/usage/get", { childId: a.child.userId, from: addDays(TODAY, -189), to: TODAY }, a.parent.token),
    );
    expectNoLeak(JSON.stringify(wide), b, "日付を広げた利用記録");
    const recorded = wide.days.filter((d) => d.recorded);
    expect(recorded).toEqual([expect.objectContaining({ date: TODAY, usedMinutes: a.minutes })]);
    // アイコンを家族Bのアプリ名で頼む → 子Aのアイコンだけ
    const icons = await ok<{ icons: { packageName: string }[] }>(
      hit("/api/child-apps/icons/get", { childId: a.child.userId, packageNames: [b.pkg, a.pkg] }, a.parent.token),
    );
    expect(icons.icons.map((i) => i.packageName)).toEqual([a.pkg]);
    // 設定の組（集計に近いもの）にも家族Bの対象外アプリ・Web サイトが混ざらない
    const config = await ok(hit("/api/config/get", { childId: a.child.userId }, a.parent.token));
    expectNoLeak(JSON.stringify(config), b, "親Aの config/get");
    // 送信 ID の差し替え: 子Aが子Bの送信 ID で送ると 409。子Bの中身は返らず、子Bの記録も変わらない
    const dup = await expectError(
      await hit(
        "/api/usage/upload",
        {
          submissionId: b.submissionId,
          childId: a.child.userId,
          days: [usageDay(TODAY, "2026-10-15T02:20:00.000Z", a.pkg, a.appLabel, 1)],
        },
        a.child.token,
      ),
      409,
      "conflict",
      "子Bの送信 ID",
    );
    expectNoLeak(dup, b, "子Bの送信 ID", ["家族Bの送信 ID"]);
    expect(await dump(b)).toEqual(beforeB);
  });

  it("PII-03 応答は画面に要る項目だけ。合言葉のハッシュ・QR の番号・内部の列（作った時刻・取り消し・送信 ID など）を返さない", async () => {
    const { a } = await twoFamilies();
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    const keys = (o: unknown) => Object.keys(o as object).sort();
    const responses: [string, unknown][] = [];
    const read = async (label: string, path: string, body: unknown, token: string) => {
      const json = await ok(hit(path, body, token));
      responses.push([label, json]);
      return json as Record<string, unknown>;
    };
    const me = await read("authMe", "/api/auth/me", undefined, a.parent.token);
    expect(keys(me)).toEqual(["name", "role", "token", "userId"]);
    const link = await read("linkStatus", "/api/link/status", undefined, a.parent.token);
    expect(keys(link)).toEqual(["partners", "role", "state"]);
    expect((link.partners as unknown[]).map(keys)).toEqual([["name", "role", "userId"]]);
    const family = await read("familyGet", "/api/family/get", undefined, a.parent.token);
    expect((family.children as unknown[]).map(keys)).toEqual([["id", "name"]]);
    const claimed = await read("pairClaim", "/api/pair/claim", { code: ticket.code }, p.token);
    expect(keys(claimed)).toEqual(["child", "expiresAt", "pairId", "parentName", "state"]);
    expect(keys(claimed.child)).toEqual(["id", "name"]);
    const status = await read("pairStatus", "/api/pair/status", { pairId: ticket.pairId }, kid.token);
    expect(keys(status)).toEqual(["child", "expiresAt", "pairId", "parentName", "state"]);
    const usage = await read(
      "usageGet",
      "/api/usage/get",
      { childId: a.child.userId, from: TODAY, to: TODAY },
      a.parent.token,
    );
    expect(keys(usage)).toEqual(["childId", "days", "from", "lastUploadedAt", "to"]);
    const day0 = (usage.days as Record<string, unknown>[])[0] ?? {};
    expect(keys(day0)).toEqual(["apps", "date", "limit", "measuredAt", "recorded", "usedMinutes"]);
    expect((day0.apps as unknown[]).map(keys)).toEqual([["excluded", "label", "packageName", "usedMinutes"]]);
    const tps = await read("testPeriodList", "/api/test-period/list", { childId: a.child.userId }, a.child.token);
    expect((tps.testPeriods as unknown[]).map(keys)).toEqual([
      ["createdByRole", "createdByUserId", "endDate", "id", "name", "startDate"],
    ]);
    const apps = await read("childAppsGet", "/api/child-apps/get", { childId: a.child.userId }, a.parent.token);
    expect((apps.apps as unknown[]).map(keys)).toEqual([["iconHash", "label", "packageName"]]);
    const device = await read("deviceStatusGet", "/api/device-status/get", { childId: a.child.userId }, a.parent.token);
    expect(keys(device.status)).toEqual(["lastSeenAt", "measuredAt", "offSince", "permissions"]);
    const config = await read("configGet", "/api/config/get", { childId: a.child.userId }, a.child.token);
    expect(keys(config.snapshot)).toEqual(
      [
        "blankPeriods",
        "blockedSites",
        "calculationVersion",
        "childId",
        "configVersion",
        "dailyLimits",
        "excludedApps",
        "generatedAt",
        "plan",
        "testPeriods",
        "usualLimitMinutes",
      ].sort(),
    );
    // どの応答のどの深さにも、内部の列の名前が出てこない
    const deny =
      /^(tokenHash|token_hash|codeHash|code_hash|code|payloadHash|submissionId|parentId|revokedAt|lastUsedAt|createdAt|expiresAtMs|provider|subject|email|password|secret|sessionId|png)$/;
    const walk = (label: string, value: unknown) => {
      if (Array.isArray(value)) for (const v of value) walk(label, v);
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value)) {
          expect(deny.test(k), `${label} に内部の項目 ${k} がある`).toBe(false);
          walk(label, v);
        }
    };
    for (const [label, json] of responses) walk(label, json);
    // QR の番号は発行の応答（pairStart）にだけあり、ほかの応答に入らない
    for (const [label, json] of responses) expect(JSON.stringify(json).includes(ticket.code), label).toBe(false);
  });

  it("PII-07 無効な id・認可の拒否・期限切れの合言葉・DB が止まったときの応答に、SQL・スタック・接続先・別の人の情報・合言葉が出ない", async () => {
    const { a, b } = await twoFamilies();
    // 無効な id（SQL の記号入り）: 入力をそのまま返さない
    const weird = "x' OR '1'='1";
    const t1 = await expectError(
      await hit("/api/plan/get", { childId: weird }, a.parent.token),
      403,
      "forbidden",
      "無効な childId",
    );
    expect(t1).not.toContain(weird);
    const t2 = await expectError(
      await hit("/api/pair/status", { pairId: "../../etc/passwd" }, a.parent.token),
      404,
      "not_found",
      "無効な pairId",
    );
    expect(t2).not.toContain("passwd");
    // 認可の拒否: 相手の情報を返さない
    expectNoLeak(
      await expectError(
        await hit("/api/usage/get", { childId: b.child.userId, from: TODAY, to: TODAY }, a.parent.token),
        403,
        "forbidden",
        "認可の拒否",
      ),
      b,
      "認可の拒否",
      ["子Bの userId"],
    );
    // DB が止まった: 接続の失敗の例外（接続先と合言葉らしき文字を含む）を起こしても、応答は一般的な internal
    const DB_SECRET = "SECTEST-DB-PASSWORD-MARKER";
    const g = globalThis as unknown as { __slopeRuntimeDb?: Promise<unknown> };
    const saved = g.__slopeRuntimeDb;
    const boom = () => {
      throw Object.assign(
        new Error(
          `connect ECONNREFUSED 10.0.0.1:5432 postgres://slope:${DB_SECRET}@db.internal/slope SELECT * FROM user_sessions`,
        ),
        { code: "ECONNREFUSED" },
      );
    };
    const logged: unknown[][] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    g.__slopeRuntimeDb = Promise.resolve({ db: new Proxy({}, { get: () => boom }), kind: "pglite" });
    try {
      for (const [label, path, body, token] of [
        ["DB 停止中の health", "/api/health", undefined, null],
        ["DB 停止中の利用記録", "/api/usage/get", { childId: a.child.userId, from: TODAY, to: TODAY }, a.parent.token],
      ] as [string, string, unknown, string | null][]) {
        const text = await expectError(await hit(path, body, token), 500, "internal", label);
        expect(text).not.toMatch(new RegExp(`${DB_SECRET}|ECONNREFUSED|10\\.0\\.0\\.1|user_sessions`));
        expect(text.includes(a.parent.token)).toBe(false);
      }
    } finally {
      g.__slopeRuntimeDb = saved;
      errorSpy.mockRestore();
    }
    // 開発ログ（console.error）には例外がそのまま出る（PII-04 の範囲。記録だけ）
    expect(logged.length).toBeGreaterThan(0);
    // DB が戻れば、ふつうに使える
    expect((await hit("/api/auth/me", undefined, a.parent.token)).status).toBe(200);
    // 期限切れの合言葉
    clock.addMs(30 * 86_400_000 + 60_000);
    const expired = await expectError(
      await hit("/api/usage/get", { childId: a.child.userId, from: TODAY, to: TODAY }, a.parent.token),
      401,
      "unauthorized",
      "期限切れの合言葉",
    );
    expect(expired.includes(a.parent.token)).toBe(false);
    expect(expired).not.toContain(a.child.userId);
  });

  it("PII-08 子A・子Bに同じ呼び名・同じアプリ・同じ分数を入れても、親の家族の一覧・利用記録・アプリ一覧に別の家族の分が混ざらない", async () => {
    const same = { childName: "たろう", pkg: "com.sectest.same", appLabel: "おなじアプリ", minutes: 30 };
    const { a, b } = await twoFamilies(same, same);
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as [Family, Family][]) {
      const who = `親${me.letter}`;
      const family = await ok<{ children: { id: string; name: string }[] }>(
        hit("/api/family/get", undefined, me.parent.token),
      );
      expect(family.children, who).toEqual([{ id: me.child.userId, name: "たろう" }]);
      const usage = await ok<{
        childId: string;
        days: { recorded: boolean; usedMinutes: number | null; apps: unknown[] }[];
      }>(hit("/api/usage/get", { childId: me.child.userId, from: addDays(TODAY, -6), to: TODAY }, me.parent.token));
      const recorded = usage.days.filter((d) => d.recorded);
      expect(
        recorded.map((d) => [d.usedMinutes, d.apps.length]),
        who,
      ).toEqual([[30, 1]]); // 60 分（2人分）にならない
      expect(JSON.stringify(usage).includes(other.child.userId), who).toBe(false);
      const apps = await ok<{ apps: unknown[] }>(
        hit("/api/child-apps/get", { childId: me.child.userId }, me.parent.token),
      );
      expect(apps.apps, who).toHaveLength(1);
      const link = await ok<{ partners: { userId: string }[] }>(hit("/api/link/status", undefined, me.parent.token));
      expect(
        link.partners.map((p) => p.userId),
        who,
      ).toEqual([me.child.userId]);
    }
  });

  it("PII-09 QR の番号は発行の応答にだけ出て、進み具合・読み取り・確定の応答、DB、サーバのログに出ない", async () => {
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    let code = "";
    const texts: string[] = [];
    try {
      const startRes = await hit("/api/pair/start", { name: "子C" }, kid.token);
      const ticket = PairTicket.parse(await startRes.json());
      code = ticket.code;
      for (const [path, body, token] of [
        ["/api/pair/status", { pairId: ticket.pairId }, kid.token],
        ["/api/pair/claim", { code }, p.token],
        ["/api/pair/status", { pairId: ticket.pairId }, p.token],
        ["/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token],
        ["/api/link/status", undefined, p.token],
      ] as [string, unknown, string][]) {
        const res = await hit(path, body, token);
        expect(res.status, path).toBe(200);
        texts.push(await res.text());
      }
      for (const spy of spies)
        for (const call of spy.mock.calls) expect(JSON.stringify(call).includes(code), "ログに QR の番号").toBe(false);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    for (const t of texts) expect(t.includes(code)).toBe(false);
    // DB にはハッシュだけ（番号そのものはどの列にもない）
    const tickets = await rows(sql`select * from pair_tickets where child_id = ${kid.userId}`);
    expect(tickets).toHaveLength(1);
    expect(JSON.stringify(tickets).includes(code)).toBe(false);
    expect(String(tickets[0]?.code_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PII-09 出し直した前の QR・期限切れの QR・使い終わった QR・取り消した QR は、どれも読めない", async () => {
    await twoFamilies();
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const old = PairTicket.parse(await ok(send("/api/pair/start", {}, kid.token)));
    const fresh2 = PairTicket.parse(await ok(send("/api/pair/start", {}, kid.token)));
    await expectError(await hit("/api/pair/claim", { code: old.code }, p.token), 409, "conflict", "出し直した前の QR");
    expect((await hit("/api/pair/claim", { code: fresh2.code }, p.token)).status).toBe(200);
    await ok(send("/api/pair/confirm", { pairId: fresh2.pairId, accept: true }, kid.token));
    const p2 = await login("secplan-PARD");
    await expectError(
      await hit("/api/pair/claim", { code: fresh2.code }, p2.token),
      409,
      "conflict",
      "使い終わった QR",
    );
    const kid2 = await login("secplan-KIDE");
    const t3 = PairTicket.parse(await ok(send("/api/pair/start", {}, kid2.token)));
    clock.addMs(10 * 60_000 + 1);
    await expectError(await hit("/api/pair/claim", { code: t3.code }, p2.token), 409, "conflict", "期限切れの QR");
    // 取り消した（「やめる」）QR も読めない
    const kid3 = await login("secplan-KIDF");
    const t4 = PairTicket.parse(await ok(send("/api/pair/start", {}, kid3.token)));
    await ok(send("/api/pair/cancel", { pairId: t4.pairId }, kid3.token));
    await expectError(await hit("/api/pair/claim", { code: t4.code }, p2.token), 409, "conflict", "取り消した QR");
  });

  it("PII-09 ログアウトした古い合言葉では、出していた QR の確定・取り消し・進み具合の確認ができない", async () => {
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    await ok(send("/api/pair/claim", { code: ticket.code }, p.token));
    await ok(app.request("/api/auth/sign-out", { method: "POST", headers: bearer(kid.token) }));
    for (const [path, body] of [
      ["/api/pair/confirm", { pairId: ticket.pairId, accept: true }],
      ["/api/pair/cancel", { pairId: ticket.pairId }],
      ["/api/pair/status", { pairId: ticket.pairId }],
    ] as [string, unknown][]) {
      await expectError(await hit(path, body, kid.token), 401, "unauthorized", `ログアウト後の ${path}`);
    }
    expect((await rows(sql`select id from family_links where child_id = ${kid.userId}`)).length).toBe(0);
  });

  // 今は穴がある: 子どもがログアウトしても、出していた QR は期限（10分）まで使える。
  // 保護者がその QR を読むと子どもの呼び名と userId が返り、子どもがもう一度ログインすれば（新しい合言葉で）そのまま確定できる
  it.fails("PII-09 子どもがログアウトしたら、出していた QR はもう読めない（期待の形。今は 200 で読めてしまう）", async () => {
    const kid = await login("secplan-KIDC");
    const p = await login("secplan-PARC");
    const ticket = PairTicket.parse(await ok(send("/api/pair/start", { name: "子C" }, kid.token)));
    await ok(app.request("/api/auth/sign-out", { method: "POST", headers: bearer(kid.token) }));
    const res = await hit("/api/pair/claim", { code: ticket.code }, p.token);
    const text = await res.text();
    expect(res.status, text).not.toBe(200);
    expect(text).not.toContain(kid.userId);
    expect(text).not.toContain("子C");
    // もう一度ログインした子どもが、前に出していた QR で確定できない
    const again = await login("secplan-KIDC");
    const confirm = await hit("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, again.token);
    expect(confirm.status).not.toBe(200);
    expect((await rows(sql`select id from family_links where child_id = ${kid.userId}`)).length).toBe(0);
  });

  // 今は穴がある（auth.ts の unlinkChild の TODO(未決)）: 保護者が子どもを外しても、子どもの設定・記録は残る。
  // 子どもが別の保護者と紐づけ直すと、新しい保護者に「前の保護者の userId（テスト期間の createdByUserId）」と、
  // 前の家族のときのテスト期間・空白期間・対象外アプリ・制限する Web サイト・利用記録・端末のアプリ一覧が見える（端末の許可の状態だけは消える）
  it.fails("PII-01 連携を外して別の保護者と紐づけ直しても、前の保護者の id と前の家族のときの設定・記録は、新しい保護者に見えない（期待の形。今は見える）", async () => {
    const { a } = await twoFamilies();
    await ok(send("/api/family/unlink", { childId: a.child.userId }, a.parent.token)); // 親Aが子Aを外す（ふつうの操作）
    const kid = await login("secplan-KIDA"); // 子Aがもう一度ログイン（外すと合言葉が全部無効になるため）
    const pc = await login("secplan-PARC"); // 新しい保護者（別の家族）
    await pairUp(kid, pc, "子A2");
    const texts: string[] = [];
    for (const [path, body] of [
      ["/api/test-period/list", { childId: a.child.userId }],
      ["/api/blank-period/list", { childId: a.child.userId }],
      ["/api/usage/get", { childId: a.child.userId, from: TODAY, to: TODAY }],
      ["/api/excluded-apps/get", { childId: a.child.userId }],
      ["/api/blocked-sites/get", { childId: a.child.userId }],
      ["/api/child-apps/get", { childId: a.child.userId }],
      ["/api/config/get", { childId: a.child.userId }],
    ] as [string, unknown][]) {
      const res = await hit(path, body, pc.token);
      expect(res.status, path).toBe(200);
      texts.push(await res.text());
    }
    const all = texts.join(" ");
    expect(all.includes(a.parent.userId), "前の保護者（親A）の userId が見える").toBe(false);
    expect(all.includes(a.mark), "前の家族のときのテスト期間・空白期間・アプリ名が見える").toBe(false);
    expect(all.includes(a.site), "前の家族のときの制限する Web サイトが見える").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// IPA: 追加の攻撃シナリオ（API の部分）
// ══════════════════════════════════════════════════════════════════════

describe("IPA. 追加の攻撃シナリオ（API の部分）", () => {
  it("IPA-01 合言葉なしで、自分で作った id・ない id・形の違う id・別の家族の id を送っても、401 の本文と大きさが同じ", async () => {
    const { a, b } = await twoFamilies();
    const texts: string[] = [];
    for (const childId of [a.child.userId, randomUUID(), "not-a-uuid", b.child.userId]) {
      texts.push(
        await expectError(await hit("/api/plan/get", { childId }, null), 401, "unauthorized", `合言葉なし ${childId}`),
      );
    }
    expect(new Set(texts).size).toBe(1);
    for (const t of texts) {
      expectNoLeak(t, a, "IPA-01");
      expectNoLeak(t, b, "IPA-01");
    }
  });

  it("IPA-02 子Aが本文の childId と role を家族Bの値に、親Aが childId・parentId・role を家族Bの値にして送っても 403 で、両家族のデータは変わらない", async () => {
    const { a, b } = await twoFamilies();
    const beforeA = await dump(a);
    const beforeB = await dump(b);
    const vB = await version(b.child.userId, b.parent.token);
    for (const [label, path, body, token] of [
      [
        "子A → 子Bの対象外アプリ",
        "/api/excluded-apps/get",
        { childId: b.child.userId, role: "parent", userId: b.parent.userId },
        a.child.token,
      ],
      [
        "子A → 子Bとして利用記録",
        "/api/usage/upload",
        { ...(bodyFor("/api/usage/upload", b, vB) as object), role: "child", userId: b.child.userId },
        a.child.token,
      ],
      [
        "子A → 子Bのテスト期間を作る",
        "/api/test-period/create",
        { ...(bodyFor("/api/test-period/create", b, vB) as object), createdByRole: "parent", role: "parent" },
        a.child.token,
      ],
      [
        "親A → 親Bを名乗って子Bの計画",
        "/api/plan/get",
        { childId: b.child.userId, parentId: b.parent.userId, userId: b.parent.userId, role: "parent" },
        a.parent.token,
      ],
      [
        "親A → 親Bを名乗って子Bの通常上限",
        "/api/plan/usual-limit",
        { ...(bodyFor("/api/plan/usual-limit", b, vB) as object), parentId: b.parent.userId },
        a.parent.token,
      ],
    ] as [string, string, unknown, string][]) {
      expectNoLeak(await expectError(await hit(path, body, token), 403, "forbidden", label), b, label);
    }
    expect(await dump(a)).toEqual(beforeA);
    expect(await dump(b)).toEqual(beforeB);
  });

  it("IPA-03 ログアウトの前の要求（読む・書く）を再送すると 401 で、前の情報を返さず、何も変わらない。期限切れ・もう一度のログインも確かめる", async () => {
    const { a } = await twoFamilies();
    const tablet = await login("secplan-PARA"); // 親Aの2台目
    const readBody = { childId: a.child.userId, from: TODAY, to: TODAY };
    const v = await version(a.child.userId, a.parent.token);
    const writeBody = { childId: a.child.userId, expectedVersion: v, usualLimitMinutes: 1 };
    expect((await hit("/api/usage/get", readBody, tablet.token)).status).toBe(200);
    expect((await hitRaw("/api/auth/sign-out", { method: "POST", headers: bearer(tablet.token) })).status).toBe(200);
    const before = await dump(a);
    for (const [path, body] of [
      ["/api/usage/get", readBody],
      ["/api/plan/usual-limit", writeBody],
    ] as [string, unknown][]) {
      const text = await expectError(
        await hit(path, body, tablet.token),
        401,
        "unauthorized",
        `ログアウト後の ${path}`,
      );
      expect(text).not.toContain(a.appLabel);
      expect(text.includes(tablet.token)).toBe(false);
    }
    expect(await dump(a)).toEqual(before);
    // もう一度ログインすると別の合言葉になり、古い合言葉は 401 のまま
    const again = await login("secplan-PARA");
    expect(again.token).not.toBe(tablet.token);
    expect((await hit("/api/auth/me", undefined, again.token)).status).toBe(200);
    await expectError(await hit("/api/auth/me", undefined, tablet.token), 401, "unauthorized", "古い合言葉");
    // 最後に使ってから30日を過ぎた合言葉は 401
    clock.addMs(30 * 86_400_000 + 60_000);
    await expectError(await hit("/api/auth/me", undefined, again.token), 401, "unauthorized", "期限切れ");
  });

  it("IPA-12 欠け・型違い・境界の外・未知の項目・壊れた JSON・深い入れ子・__proto__ は 4xx で止まり、5xx にならず、DB も変わらず、そのあとも使える", async () => {
    const { a } = await twoFamilies();
    const v = await version(a.child.userId, a.parent.token);
    const childId = a.child.userId;
    const before = await dump(a);
    const usual = (usualLimitMinutes: unknown) => ({ childId, expectedVersion: v, usualLimitMinutes });
    const plan = { childId, expectedVersion: v, planStartDate: TODAY, startLimitMinutes: 200, finalGoalMinutes: 100 };
    const tp = (over: object) => ({ childId, expectedVersion: v, ...takeover, ...over });
    const json: [string, string, unknown, string][] = [
      ["必須の欠け", "/api/plan/save", { ...plan, finalGoalMinutes: undefined }, a.parent.token],
      ["文字の分数", "/api/plan/save", { ...plan, startLimitMinutes: "200" }, a.parent.token],
      ["負の分", "/api/plan/usual-limit", usual(-1), a.parent.token],
      ["小数の分", "/api/plan/usual-limit", usual(1.5), a.parent.token],
      ["巨大な数", "/api/plan/usual-limit", usual(1e300), a.parent.token],
      ["null", "/api/plan/usual-limit", usual(null), a.parent.token],
      ["配列", "/api/plan/usual-limit", usual([60]), a.parent.token],
      ["名前が上限+1", "/api/test-period/create", tp({ name: "あ".repeat(121) }), a.parent.token],
      ["ない日付", "/api/test-period/create", tp({ startDate: "2026-02-30", endDate: "2026-03-01" }), a.parent.token],
      ["開始>終了", "/api/test-period/create", tp({ startDate: "2026-11-05", endDate: "2026-11-01" }), a.parent.token],
      [
        "負の利用分",
        "/api/usage/upload",
        { submissionId: randomUUID(), childId, days: [usageDay(TODAY, "2026-10-15T02:55:00.000Z", a.pkg, "x", -5)] },
        a.child.token,
      ],
      [
        "送信 ID が uuid でない",
        "/api/usage/upload",
        { submissionId: "1", childId, days: [usageDay(TODAY, "2026-10-15T02:55:00.000Z", a.pkg, "x", 5)] },
        a.child.token,
      ],
      ["ログアウトの未知の項目", "/api/auth/sign-out", { otherDevices: true, everyone: true }, a.parent.token],
    ];
    for (const [label, path, body, token] of json) {
      await expectError(await hit(path, body, token), 400, "bad_request", label);
    }
    const raw: [string, string, string][] = [
      ["配列の本文", "/api/plan/get", "[]"],
      ["null の本文", "/api/plan/get", "null"],
      ["深い入れ子", "/api/plan/get", `${"[".repeat(10_000)}${"]".repeat(10_000)}`],
    ];
    for (const [label, path, body] of raw) {
      const res = await hitRaw(path, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json", ...bearer(a.parent.token) },
      });
      expect(res.status, label).toBe(400);
    }
    // __proto__ を混ぜても、子どもが保護者の操作をできるようにはならず、ほかの入力にも広がらない
    const polluted = `{"childId":"${childId}","expectedVersion":${v},"usualLimitMinutes":1,"__proto__":{"role":"parent","isAdmin":true},"constructor":{"prototype":{"role":"parent"}}}`;
    const res = await hitRaw("/api/plan/usual-limit", {
      method: "POST",
      body: polluted,
      headers: { "Content-Type": "application/json", ...bearer(a.child.token) },
    });
    await expectError(res, 403, "forbidden", "__proto__");
    expect(({} as Record<string, unknown>).role).toBeUndefined();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(await dump(a)).toEqual(before);
    // そのあともふつうに使える（ログアウトの未知の項目でログアウトしていない）
    expect((await hit("/api/plan/get", { childId }, a.parent.token)).status).toBe(200);
    expect((await hit("/api/health", undefined, null)).status).toBe(200);
  });
});
