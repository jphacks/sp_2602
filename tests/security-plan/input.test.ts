// セキュリティテスト計画（SECURITY_TEST/ANDROID_SECURITY_TEST_PLAN.md）の「入力・業務ルール・DB 境界」などを、手元だけで確かめる。
// 担当: B（IN-01〜12）、NET-04・NET-06・NET-08、AVL-01・AVL-02・AVL-04、IPA-04〜09・IPA-12・IPA-15、PII-10（サーバ側）。
// 結果の記録: SECURITY_TEST/RESULTS_API_INPUT.md
// 決まりごと:
//   - サーバはプロセスの中（Hono の app.request）。DB は PGlite（メモリの上）。MOCK=1。ネットワークには出ない
//   - 人は MOCK のログイン（"mock-new-<文字>"）で作る架空の人だけ。親A↔子A・親B↔子B を QR の紐づけで作る
//   - 1つのテスト（it）で送る「試しの要求」は 20 回まで。大きすぎる本文は1回だけ
//   - 期待どおりでなかったもの（穴）は、期待の形で書いて it.fails にする（「今は穴がある」の印。直したら it に戻す）
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import { ApiError } from "@contracts/errors";
import { PairTicket } from "@contracts/schemas";
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app, { MAX_BODY_BYTES } from "@/server/app";
import { db } from "@/server/db";
import { excludedApps } from "../../backend/src/db/schema/excluded-apps";
import { familyLinks } from "../../backend/src/db/schema/family";
import { pairTickets } from "../../backend/src/db/schema/pairing";
import { testPeriods } from "../../backend/src/db/schema/planning";
import { childUsualLimits } from "../../backend/src/db/schema/settings-state";
import { usageDayReports, usageRecords, usageSyncBatches } from "../../backend/src/db/schema/usage";
import { users } from "../../backend/src/db/schema/users";
import { clock, fresh, get, link, newFamily, newPerson, ok, post, postRaw, versionOf } from "../verify/helpers";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TODAY = "2026-10-15";
const YESTERDAY = "2026-10-14";

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z"); // 日本時間 10/15 12:00
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ── 道具 ──

type Family = Awaited<ReturnType<typeof newFamily>>;

// 応答の中身に、SQL・スタック・パス・環境変数・DB の名前などが出ていないか
const LEAK =
  /(\bselect\s|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+"|\bwhere\s+"|postgres|pglite|drizzle|neon|sqlstate|violates|constraint|\bstack\b|\s+at\s+\S+\s+\(|node_modules|[A-Za-z]:\\|\/src\/|\.ts:\d+|database_url|process\.env|econnrefused|syntaxerror|typeerror|zoderror)/i;

function expectNoLeak(text: string, secrets: string[] = []) {
  expect(text).not.toMatch(LEAK);
  for (const s of secrets) expect(text).not.toContain(s);
}

// エラーの応答は契約の ApiError の形で、中身が漏れていない
async function expectSafeError(res: Response, status: number, secrets: string[] = []) {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  ApiError.parse(JSON.parse(text));
  expectNoLeak(text, secrets);
  return JSON.parse(text) as ApiError;
}

const rows = async (table: PgTable) => {
  const [r] = await (await db()).select({ n: count() }).from(table);
  return r?.n ?? 0;
};

const period = (name: string, startDate = "2026-11-01", endDate = "2026-11-02") => ({ name, startDate, endDate });

async function createPeriod(f: Family, name: string, dates?: { startDate: string; endDate: string }) {
  const childId = f.child.userId;
  const v = await versionOf(childId, f.parent.token);
  return post(
    "/api/test-period/create",
    { childId, expectedVersion: v, ...period(name, dates?.startDate, dates?.endDate) },
    f.parent.token,
  );
}

const usageApp = (packageName: string, label: string, usedMinutes: unknown = 5) => ({
  packageName,
  label,
  usedMinutes,
  excluded: false,
});
const usageBody = (childId: string, apps: unknown[], date = TODAY, measuredAt = "2026-10-15T02:00:00.000Z") => ({
  submissionId: crypto.randomUUID(),
  childId,
  days: [{ date, measuredAt, restrictedMinutes: 5, apps }],
});

async function twoFamilies() {
  const a = await newFamily("A");
  const b = await newFamily("B");
  return { a, b };
}

// ═════════════════════════ B. 入力検証・業務ルール・DB 境界 ═════════════════════════

describe("IN-01 / IPA-04: SQL インジェクション", () => {
  const sqlish = ["' OR '1'='1", '";--', "test');--", "test' OR '1'='1"];

  it("IN-01/IPA-04: 名前の欄（テスト期間の名前・QR の呼び名）の SQL の文字は文字列として保存され、他の家庭の行は増減しない", async () => {
    const { a, b } = await twoFamilies();
    const before = await rows(testPeriods);
    const usersBefore = await rows(users);

    for (const [i, name] of sqlish.entries()) {
      const res = await createPeriod(a, name, { startDate: `2026-11-0${i + 1}`, endDate: `2026-11-0${i + 1}` });
      const text = await res.text();
      expect(res.status, text).toBe(200);
      expectNoLeak(text);
      expect(JSON.parse(text).testPeriod.name).toBe(name);
    }
    // QR の呼び名（DB の users.display_name に入る）
    const kid = await newPerson("sql-kid");
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", { name: "' OR '1'='1" }, kid.token)));

    const listA = await ok<{ testPeriods: { name: string }[] }>(
      post("/api/test-period/list", { childId: a.child.userId }, a.parent.token),
    );
    expect(listA.testPeriods.map((p) => p.name)).toEqual(sqlish);
    const listB = await ok<{ testPeriods: unknown[] }>(
      post("/api/test-period/list", { childId: b.child.userId }, b.parent.token),
    );
    expect(listB.testPeriods).toEqual([]); // 親B には何も増えない
    expect(await rows(testPeriods)).toBe(before + sqlish.length);
    expect(await rows(users)).toBe(usersBefore + 1); // 増えたのは sql-kid だけ
    const [row] = await (await db())
      .select({ name: pairTickets.childDisplayName })
      .from(pairTickets)
      .where(eq(pairTickets.id, ticket.pairId));
    expect(row?.name).toBe("' OR '1'='1");
  });

  it("IN-01/IPA-04: id の欄（childId・pairId・QR の番号・テスト期間の id）の SQL の文字は、他の家庭の行を返さず・変えず、SQL の文も出さない", async () => {
    const { a, b } = await twoFamilies();
    await createPeriod(b, "Bのテスト");
    const bBefore = await ok<{ testPeriods: unknown[] }>(
      post("/api/test-period/list", { childId: b.child.userId }, b.parent.token),
    );
    const inj = "' OR '1'='1";
    const vA = await versionOf(a.child.userId, a.parent.token);

    await expectSafeError(await post("/api/plan/get", { childId: inj }, a.parent.token), 403);
    await expectSafeError(await post("/api/test-period/list", { childId: inj }, a.parent.token), 403);
    await expectSafeError(
      await post("/api/usage/get", { childId: `${inj}--`, from: TODAY, to: TODAY }, a.parent.token),
      403,
    );
    await expectSafeError(await post("/api/config/get", { childId: inj }, a.child.token), 403);
    await expectSafeError(await post("/api/pair/status", { pairId: inj }, a.parent.token), 404);
    await expectSafeError(await post("/api/pair/claim", { code: inj }, a.parent.token), 404);
    const fresh1 = await newPerson("sql-parent");
    await expectSafeError(await post("/api/pair/claim", { code: "test');--" }, fresh1.token), 404);
    await expectSafeError(
      await post("/api/test-period/delete", { childId: a.child.userId, expectedVersion: vA, id: inj }, a.parent.token),
      404,
    );
    await expectSafeError(
      await post(
        "/api/test-period/update",
        { childId: a.child.userId, expectedVersion: vA, id: `${inj}--`, ...period("x") },
        a.parent.token,
      ),
      404,
    );

    const bAfter = await ok<{ testPeriods: unknown[] }>(
      post("/api/test-period/list", { childId: b.child.userId }, b.parent.token),
    );
    expect(bAfter.testPeriods).toEqual(bBefore.testPeriods);
  });
});

describe("IN-02 / IPA-05: XSS（保存した値の表示）", () => {
  const payloads = ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"];

  it("IN-02/IPA-05: テスト期間の名前・対象外アプリの名前・利用記録のアプリ名・QR の呼び名に入れたタグは、そのままの文字列として JSON で返る", async () => {
    const a = await newFamily("xss");
    const [script, img] = payloads as [string, string];
    expect((await createPeriod(a, script)).status).toBe(200);
    const v = await versionOf(a.child.userId, a.parent.token);
    await ok(
      post(
        "/api/excluded-apps/save",
        { childId: a.child.userId, expectedVersion: v, apps: [{ packageName: "com.example.x", label: img }] },
        a.parent.token,
      ),
    );
    await ok(post("/api/usage/upload", usageBody(a.child.userId, [usageApp("com.example.y", script)]), a.child.token));
    const kid = await newPerson("xss-kid");
    const parent = await newPerson("xss-parent");
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", { name: img }, kid.token)));
    await ok(post("/api/pair/claim", { code: ticket.code }, parent.token));
    await ok(post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token));

    // 子どもの端末が読む組（C7）
    const cfgRes = await post("/api/config/get", { childId: a.child.userId }, a.child.token);
    expect(cfgRes.headers.get("content-type")).toMatch(/^application\/json/);
    const cfg = (await cfgRes.json()) as {
      snapshot: { testPeriods: { name: string }[]; excludedApps: { label: string }[] };
    };
    expect(cfg.snapshot.testPeriods.map((p) => p.name)).toEqual([script]);
    expect(cfg.snapshot.excludedApps.map((p) => p.label)).toEqual([img]);
    // 親の実績（C6）
    const usage = await ok<{ days: { apps: { label: string }[] }[] }>(
      post("/api/usage/get", { childId: a.child.userId, from: TODAY, to: TODAY }, a.parent.token),
    );
    expect(usage.days[0]?.apps.map((x) => x.label)).toEqual([script]);
    // 家族の一覧（QR の呼び名）
    const fam = await ok<{ children: { name: string }[] }>(get("/api/family/get", parent.token));
    expect(fam.children.map((c) => c.name)).toEqual([img]);
  });

  it("IN-02/IPA-05: アプリ（src/）と Kotlin（modules/）に、HTML として描く場所（WebView・dangerouslySetInnerHTML・innerHTML・Html.fromHtml・loadData・evaluateJavascript）がない", () => {
    const pattern =
      /WebView|dangerouslySetInnerHTML|\.innerHTML|Html\.fromHtml|loadData(WithBaseURL)?\(|evaluateJavascript|injectedJavaScript/;
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "build" || name.startsWith(".")) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?|kt|java|xml)$/.test(name) && pattern.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(join(ROOT, "src"));
    walk(join(ROOT, "modules"));
    walk(join(ROOT, "plugins"));
    expect(hits).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).filter((d) => /webview/i.test(d))).toEqual([]);
  });
});

describe("IN-03: 名前の長さと文字", () => {
  it("IN-03: テスト期間の名前は 空・空白だけ・121 文字が 400、120 文字ちょうど・絵文字・結合文字は 200 でそのまま返る（500 にならない）", async () => {
    const a = await newFamily("len");
    const periodsBefore = await rows(testPeriods);
    const bad = ["", "   ", "あ".repeat(121), "😀".repeat(61)]; // 絵文字は UTF-16 で 2 つ分に数える
    for (const name of bad) await expectSafeError(await createPeriod(a, name), 400);
    const good = ["あ".repeat(120), "😀".repeat(60), "がテスト", "👨‍👩‍👧 家族", "école"];
    for (const [i, name] of good.entries()) {
      const d = `2026-11-${String(10 + i).padStart(2, "0")}`;
      const res = await createPeriod(a, name, { startDate: d, endDate: d });
      expect(res.status, await res.clone().text()).toBe(200);
      expect(((await res.json()) as { testPeriod: { name: string } }).testPeriod.name).toBe(name);
    }
    expect(await rows(testPeriods)).toBe(periodsBefore + good.length);
  });

  it("IN-03: QR の呼び名は 空・41 文字が 400、40 文字ちょうどは 200（画面の上限と同じ）", async () => {
    const kid = await newPerson("len-kid");
    await expectSafeError(await post("/api/pair/start", { name: "" }, kid.token), 400);
    await expectSafeError(await post("/api/pair/start", { name: "あ".repeat(41) }, kid.token), 400);
    expect((await post("/api/pair/start", { name: "あ".repeat(40) }, kid.token)).status).toBe(200);
  });

  // 穴: 文字列の中の NUL（\u0000）は Postgres に保存できない。入口で断らないので、DB のエラーがそのまま 500 になる
  it.fails("IN-03: 名前に NUL（\\u0000）を入れたら 400 で断る（500 にしない）", async () => {
    const a = await newFamily("nul");
    await expectSafeError(await createPeriod(a, "テスト\u0000名"), 400);
  });
});

describe("IN-04: 日付", () => {
  it("IN-04: 存在しない日・形の違う日・開始日 > 終了日・時刻つきは 400 で、何も保存しない", async () => {
    const a = await newFamily("date");
    const periodsBefore = await rows(testPeriods);
    const bad: [string, string][] = [
      ["2026-02-30", "2026-02-30"],
      ["2026-13-01", "2026-13-01"],
      ["2026/11/01", "2026/11/01"],
      ["2026-11-1", "2026-11-1"],
      ["2026-11-05", "2026-11-04"],
      ["2026-11-01T00:00:00Z", "2026-11-02"],
      ["20261101", "20261102"],
    ];
    for (const [startDate, endDate] of bad)
      await expectSafeError(await createPeriod(a, "x", { startDate, endDate }), 400);
    await expectSafeError(
      await post("/api/usage/get", { childId: a.child.userId, from: TODAY, to: YESTERDAY }, a.parent.token),
      400,
    );
    await expectSafeError(
      await post("/api/usage/get", { childId: a.child.userId, from: "2026-04-01", to: TODAY }, a.parent.token),
      400,
    ); // 190 日を超える
    await expectSafeError(
      await post("/api/usage/upload", usageBody(a.child.userId, [], "2026-02-29"), a.child.token),
      400,
    ); // 2026 年はうるう年でない
    expect(await rows(testPeriods)).toBe(periodsBefore);
  });

  it("IN-04: 日本時間で日付が変わった直後（UTC 15:30）に保存した日付は、そのまま同じ日で返る（別の日に化けない）", async () => {
    const a = await newFamily("tz");
    clock.set("2026-10-15T15:30:00Z"); // 日本時間 10/16 0:30
    const res = await createPeriod(a, "tz", { startDate: "2026-10-16", endDate: "2026-10-16" });
    const saved = ((await res.json()) as { testPeriod: { startDate: string; endDate: string } }).testPeriod;
    expect(saved).toMatchObject({ startDate: "2026-10-16", endDate: "2026-10-16" });
    const v = await versionOf(a.child.userId, a.parent.token);
    const usual = await ok<{ configVersion: number }>(
      post(
        "/api/plan/usual-limit",
        { childId: a.child.userId, expectedVersion: v, usualLimitMinutes: 60 },
        a.parent.token,
      ),
    );
    expect(usual.configVersion).toBe(v + 1);
    const cfg = await ok<{ snapshot: { dailyLimits: { date: string }[]; testPeriods: { startDate: string }[] } }>(
      post("/api/config/get", { childId: a.child.userId }, a.child.token),
    );
    expect(cfg.snapshot.dailyLimits[0]?.date).toBe("2026-10-16"); // 「今日」は日本時間の 10/16
    expect(cfg.snapshot.testPeriods[0]?.startDate).toBe("2026-10-16");
  });

  // 穴（軽い）: テスト期間・空白期間の日付は形と前後しか見ていない。0001 年や 9999 年の期間も保存できる
  it.fails("IN-04: 極端な過去（0001 年）・未来（9999 年）のテスト期間は 400 で断る", async () => {
    const a = await newFamily("far");
    await expectSafeError(await createPeriod(a, "past", { startDate: "0001-01-01", endDate: "0001-01-02" }), 400);
    await expectSafeError(await createPeriod(a, "future", { startDate: "9999-12-30", endDate: "9999-12-31" }), 400);
  });

  it("IN-04（記録）: 0001 年・9999 年のテスト期間は今は 200 で保存される（500 にはならない。中身はそのまま返る）", async () => {
    const a = await newFamily("far2");
    const past = await createPeriod(a, "past", { startDate: "0001-01-01", endDate: "0001-01-02" });
    const future = await createPeriod(a, "future", { startDate: "9999-12-30", endDate: "9999-12-31" });
    expect([past.status, future.status]).toEqual([200, 200]);
    const list = await ok<{ testPeriods: { startDate: string }[] }>(
      post("/api/test-period/list", { childId: a.child.userId }, a.parent.token),
    );
    expect(list.testPeriods.map((p) => p.startDate)).toEqual(["0001-01-01", "9999-12-30"]);
  });
});

describe("IN-05: 分の値と版の値", () => {
  it("IN-05: 通常上限の分に 負・1441・小数・巨大・文字・null・配列・2^31 を送ると 400 で、上限も版も変わらない。0 分は 200（有効な上限）", async () => {
    const a = await newFamily("num");
    const childId = a.child.userId;
    const v = await versionOf(childId, a.parent.token);
    const usualBefore = await rows(childUsualLimits);
    const bad: unknown[] = [-1, 1441, 1.5, 1e20, "60", null, [60], 2 ** 31, Number.NaN, true];
    for (const usualLimitMinutes of bad) {
      await expectSafeError(
        await post("/api/plan/usual-limit", { childId, expectedVersion: v, usualLimitMinutes }, a.parent.token),
        400,
      );
    }
    expect(await versionOf(childId, a.parent.token)).toBe(v);
    expect(await rows(childUsualLimits)).toBe(usualBefore);
    const zero = await ok<{ usualLimitMinutes: number }>(
      post("/api/plan/usual-limit", { childId, expectedVersion: v, usualLimitMinutes: 0 }, a.parent.token),
    );
    expect(zero.usualLimitMinutes).toBe(0);
  });

  it("IN-05: 利用記録の usedMinutes・restrictedMinutes に 負・小数・文字・null・1441 を送ると 400 で、何も保存しない", async () => {
    const a = await newFamily("num2");
    const childId = a.child.userId;
    const batchesBefore = await rows(usageSyncBatches);
    const recordsBefore = await rows(usageRecords);
    for (const m of [-1, 1.5, "5", null, 1441, [5]]) {
      await expectSafeError(
        await post("/api/usage/upload", usageBody(childId, [usageApp("com.example.a", "A", m)]), a.child.token),
        400,
      );
    }
    for (const m of [-1, 99999999999]) {
      const body = usageBody(childId, []);
      (body.days[0] as { restrictedMinutes: unknown }).restrictedMinutes = m;
      await expectSafeError(await post("/api/usage/upload", body, a.child.token), 400);
    }
    expect(await rows(usageSyncBatches)).toBe(batchesBefore);
    expect(await rows(usageRecords)).toBe(recordsBefore);
  });

  it("IN-05: 版（expectedVersion・knownVersion）の巨大な値は 409 か 400 で、DB の整数のあふれ（500）にならない", async () => {
    const a = await newFamily("num3");
    const childId = a.child.userId;
    for (const expectedVersion of [2 ** 31, Number.MAX_SAFE_INTEGER]) {
      await expectSafeError(
        await post("/api/plan/usual-limit", { childId, expectedVersion, usualLimitMinutes: 60 }, a.parent.token),
        409,
      );
      await expectSafeError(
        await post("/api/test-period/create", { childId, expectedVersion, ...period("x") }, a.parent.token),
        409,
      );
    }
    await expectSafeError(
      await post("/api/plan/usual-limit", { childId, expectedVersion: 2 ** 53, usualLimitMinutes: 60 }, a.parent.token),
      400,
    );
    await expectSafeError(
      await post("/api/plan/usual-limit", { childId, expectedVersion: -1, usualLimitMinutes: 60 }, a.parent.token),
      400,
    );
    const big = await post("/api/config/get", { childId, knownVersion: 2 ** 31 }, a.child.token);
    expect(big.status).toBe(200);
    expect(((await big.json()) as { changed: boolean }).changed).toBe(true);
  });
});

describe("IN-06: アプリの識別子（packageName / appId）", () => {
  it("IN-06: 長さ 256・空文字は 400。子どもの端末のアプリ一覧・対象外アプリでは、空白だけも 400", async () => {
    const a = await newFamily("app");
    const childId = a.child.userId;
    const excludedBefore = await rows(excludedApps);
    const recordsBefore = await rows(usageRecords);
    const long = "a".repeat(256);
    await expectSafeError(
      await post("/api/usage/upload", usageBody(childId, [usageApp(long, "A")]), a.child.token),
      400,
    );
    await expectSafeError(await post("/api/usage/upload", usageBody(childId, [usageApp("", "A")]), a.child.token), 400);
    await expectSafeError(
      await post("/api/child-apps/upload", { childId, apps: [{ packageName: "   ", label: "A" }] }, a.child.token),
      400,
    );
    await expectSafeError(
      await post("/api/child-apps/upload", { childId, apps: [{ packageName: long, label: "A" }] }, a.child.token),
      400,
    );
    const v = await versionOf(childId, a.parent.token);
    for (const packageName of ["   ", long, ""]) {
      await expectSafeError(
        await post(
          "/api/excluded-apps/save",
          { childId, expectedVersion: v, apps: [{ packageName, label: "A" }] },
          a.parent.token,
        ),
        400,
      );
    }
    expect(await rows(excludedApps)).toBe(excludedBefore);
    expect(await rows(usageRecords)).toBe(recordsBefore);
  });

  it("IN-06: 制御文字（改行・ベル・タブ）を含む識別子・名前は文字列のまま保存され、JSON の中では \\n などに逃がされて返る（応答を壊さない）", async () => {
    const a = await newFamily("ctl");
    const childId = a.child.userId;
    const pkg = "com.example\n.bell\u0007";
    const label = "名前\r\n[INFO] 偽の行\t";
    await ok(post("/api/usage/upload", usageBody(childId, [usageApp(pkg, label)]), a.child.token));
    const res = await post("/api/usage/get", { childId, from: TODAY, to: TODAY }, a.parent.token);
    const text = await res.text();
    // 生の制御文字は応答に入らない（JSON の中では \n・\u0007 のように逃がされる）
    expect([...text].filter((ch) => ch.charCodeAt(0) < 0x20)).toEqual([]);
    const body = JSON.parse(text) as { days: { apps: { packageName: string; label: string }[] }[] };
    expect(body.days[0]?.apps[0]).toMatchObject({ packageName: pkg, label });
  });

  // 穴: 利用記録のアプリ名（packageName）は空白だけを入口で断らない。DB の「空でない」の決まりに当たって 500 になる
  it.fails("IN-06: 利用記録の packageName が空白だけなら 400 で断る（500 にしない）", async () => {
    const a = await newFamily("blank");
    await expectSafeError(
      await post("/api/usage/upload", usageBody(a.child.userId, [usageApp("   ", "A")]), a.child.token),
      400,
    );
  });

  // 穴: NUL（\u0000）は Postgres に保存できない。入口で断らないので 500 になる
  it.fails("IN-06: 利用記録・端末のアプリ一覧の識別子に NUL（\\u0000）を入れたら 400 で断る（500 にしない）", async () => {
    const a = await newFamily("nul2");
    const childId = a.child.userId;
    await expectSafeError(
      await post("/api/usage/upload", usageBody(childId, [usageApp("com.example.\u0000", "A")]), a.child.token),
      400,
    );
    await expectSafeError(
      await post(
        "/api/child-apps/upload",
        { childId, apps: [{ packageName: "com.example.\u0000", label: "A" }] },
        a.child.token,
      ),
      400,
    );
  });
});

describe("IN-07: 余計な項目（mass assignment）", () => {
  it("IN-07: role・isAdmin・ownerId・parentId・userId・sinceVersion・updatedByUserId を混ぜても無視され、役割・持ち主・版は変わらない", async () => {
    const { a, b } = await twoFamilies();
    const childId = a.child.userId;
    // ログインで役割・userId を名乗る
    const s = await ok<{ token: string; userId: string; role: string | null }>(
      post(
        "/api/auth/google",
        { idToken: "mock-new-mass", role: "parent", userId: b.parent.userId, isAdmin: true },
        null,
      ),
    );
    expect(s.role).toBeNull();
    expect(s.userId).not.toBe(b.parent.userId);
    // QR を出すときに役割・相手を名乗る
    // （契約の Zod が知らない項目を捨てるので、childId・parentId・role を入れても QR は自分の分だけ）
    const t = await ok<{ pairId: string }>(
      post(
        "/api/pair/start",
        { role: "parent", parentId: b.parent.userId, childId: b.child.userId, isAdmin: true },
        s.token,
      ),
    );
    const [ticketRow] = await (await db()).select().from(pairTickets).where(eq(pairTickets.id, t.pairId));
    expect(ticketRow).toMatchObject({ childId: s.userId, parentId: null, state: "waiting" });
    // 保存で持ち主・権限を名乗る
    const v = await versionOf(childId, a.parent.token);
    await ok(
      post(
        "/api/plan/usual-limit",
        {
          childId,
          expectedVersion: v,
          usualLimitMinutes: 60,
          role: "admin",
          isAdmin: true,
          ownerId: b.parent.userId,
          updatedByUserId: b.parent.userId,
          nested: { role: "parent", ownerId: b.parent.userId },
        },
        a.parent.token,
      ),
    );
    const v2 = await versionOf(childId, a.parent.token);
    const saved = await ok<{ apps: { sinceVersion: number }[]; configVersion: number }>(
      post(
        "/api/excluded-apps/save",
        {
          childId,
          expectedVersion: v2,
          apps: [
            { packageName: "com.example.m", label: "M", sinceVersion: 999, enabled: false, childId: b.child.userId },
          ],
        },
        a.parent.token,
      ),
    );
    expect(saved.apps).toEqual([{ packageName: "com.example.m", label: "M", sinceVersion: v2 + 1 }]);

    const d = await db();
    const [usual] = await d.select().from(childUsualLimits).where(eq(childUsualLimits.childId, childId));
    expect(usual).toMatchObject({ minutes: 60, updatedByUserId: a.parent.userId });
    const [ex] = await d.select().from(excludedApps).where(eq(excludedApps.childId, childId));
    expect(ex).toMatchObject({ sinceVersion: v2 + 1, enabled: true, updatedByUserId: a.parent.userId });
    const exB = await d.select().from(excludedApps).where(eq(excludedApps.childId, b.child.userId));
    expect(exB).toEqual([]); // 子B の分は作られない
    const roles = await d.select({ id: users.id, role: users.role }).from(users);
    const roleOf = (id: string) => roles.find((r) => r.id === id)?.role;
    expect([roleOf(a.parent.userId), roleOf(a.child.userId), roleOf(s.userId)]).toEqual(["parent", "child", null]);
  });
});

describe("IN-09 / NET-06: 版の混ざり（サーバ側）", () => {
  it("IN-09/NET-06: configGet の組は1つの版でそろっている。端末がサーバより先の版を送っても「変わっていない」にせず、新しい組を丸ごと返す", async () => {
    const a = await newFamily("ver");
    const childId = a.child.userId;
    const v0 = await versionOf(childId, a.parent.token);
    await ok(post("/api/plan/usual-limit", { childId, expectedVersion: v0, usualLimitMinutes: 60 }, a.parent.token));
    expect((await createPeriod(a, "テスト")).status).toBe(200);
    const vNow = await versionOf(childId, a.parent.token);

    const cfg = await ok<{
      changed: true;
      snapshot: { configVersion: number; plan: unknown; testPeriods: unknown[]; dailyLimits: unknown[] };
    }>(post("/api/config/get", { childId, knownVersion: vNow + 5 }, a.child.token));
    expect(cfg.changed).toBe(true);
    expect(cfg.snapshot.configVersion).toBe(vNow);
    expect(cfg.snapshot.testPeriods).toHaveLength(1);
    // 古い版を知っている端末にも、今の版の組を返す（古い組の一部を混ぜない）
    const old = await ok<{ changed: boolean; snapshot: { configVersion: number } }>(
      post("/api/config/get", { childId, knownVersion: v0 }, a.child.token),
    );
    expect(old.snapshot.configVersion).toBe(vNow);
    const same = await ok<{ changed: boolean }>(
      post("/api/config/get", { childId, knownVersion: vNow }, a.child.token),
    );
    expect(same.changed).toBe(false);
    // 古い版での保存は conflict で、何も変わらない
    await expectSafeError(
      await post("/api/test-period/create", { childId, expectedVersion: v0, ...period("古い") }, a.parent.token),
      409,
    );
    expect(await versionOf(childId, a.parent.token)).toBe(vNow);
  });
});

describe("IN-11: 大きな本文", () => {
  it("IN-11: 上限（8 MiB）を超える本文は 1 回だけ送り、400 で断る。その後もサーバと DB は正常に動く", async () => {
    const a = await newFamily("big");
    const batchesBefore = await rows(usageSyncBatches);
    const huge = JSON.stringify({ ...usageBody(a.child.userId, []), pad: "x".repeat(MAX_BODY_BYTES) });
    const res = await postRaw("/api/usage/upload", huge, a.child.token);
    const err = await expectSafeError(res, 400);
    expect(err.message).toBe("送る内容が大きすぎます");
    expect(await rows(usageSyncBatches)).toBe(batchesBefore);
    // 通常サイズより大きいが上限の内（100 KiB の idToken）は、契約の検査・トークンの検証で 401 になる（500 にならない）
    await expectSafeError(await post("/api/auth/google", { idToken: "e".repeat(100 * 1024) }, null), 401);
    expect((await get("/api/health", null)).status).toBe(200);
    await ok(post("/api/usage/upload", usageBody(a.child.userId, [usageApp("com.example.a", "A")]), a.child.token));
  });
});

describe("IN-12: ログ", () => {
  function captureLogs() {
    const lines: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(format(...args));
      });
    return lines;
  }

  it("IN-12: ふつうの流れ（ログイン・QR・利用記録・設定の保存・断られる要求）では、サーバはログを出さず、合言葉・QR の番号を記録しない", async () => {
    const logs = captureLogs();
    const kid = await newPerson("log-kid");
    const parent = await newPerson("log-parent");
    const { ticket } = await link(kid.token, parent.token);
    await ok(
      post(
        "/api/usage/upload",
        usageBody(kid.userId, [usageApp("com.example.a", `x' OR 1=1;--\n[ERROR] 偽の行 {"a":"b"}`)]),
        kid.token,
      ),
    );
    await post("/api/plan/get", { childId: "' OR 1=1;--" }, parent.token); // 403
    await postRaw("/api/plan/get", '{"childId": "\n[ERROR] x', parent.token); // 壊れた JSON
    const all = logs.join("\n");
    expect(all).not.toContain(kid.token);
    expect(all).not.toContain(parent.token);
    expect(all).not.toContain(ticket.code);
    expect(logs).toEqual([]);
  });

  // 穴: 想定外の失敗（500）のときは console.error("[internal]", e) が例外を丸ごと出す。DB のエラーには SQL と入力の値
  //   （子どものアプリ名など）がそのまま入るので、ログに SQL・利用の詳細・入力の改行（偽の行）が出る
  it.fails("IN-12: 500 になった要求でも、ログに SQL・入力の値（改行で作った偽の行・アプリ名）を出さない", async () => {
    const a = await newFamily("log500");
    const logs = captureLogs();
    const res = await post(
      "/api/usage/upload",
      usageBody(a.child.userId, [usageApp("   ", "ひみつのアプリ\n[INFO] 偽のログの行")]),
      a.child.token,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const all = logs.join("\n");
    expect(all).not.toContain("ひみつのアプリ");
    expect(all).not.toContain("\n[INFO] 偽のログの行");
    expect(all).not.toMatch(/insert into|select /i);
  });

  it("IN-12（記録）: 上の 500 のとき、今はログに SQL とアプリ名と偽の行がそのまま出る（応答の本文には出ない）", async () => {
    const a = await newFamily("log500b");
    const logs = captureLogs();
    const res = await post(
      "/api/usage/upload",
      usageBody(a.child.userId, [usageApp("   ", "ひみつのアプリ\n[INFO] 偽のログの行")]),
      a.child.token,
    );
    await expectSafeError(res, 500, ["ひみつのアプリ"]);
    const all = logs.join("\n");
    expect(all).toContain("[internal]");
    expect(all).toContain("ひみつのアプリ\n[INFO] 偽のログの行");
    expect(all).toMatch(/insert into/i);
    expect(all).not.toContain(a.child.token); // 合言葉そのものは出ない
  });
});

// ═════════════════════════ C. 通信・セッション（サーバ側） ═════════════════════════

describe("NET-04: 利用記録の再送", () => {
  it("NET-04: 同じ利用記録の POST を 1 回だけ再送すると duplicate で、行は増えない。合言葉の期限が切れたら 401（もう一度ログインしてください）", async () => {
    const a = await newFamily("resend");
    const body = usageBody(a.child.userId, [usageApp("com.example.a", "A", 7)]);
    const first = await ok<{ status: string }>(post("/api/usage/upload", body, a.child.token));
    expect(first.status).toBe("accepted");
    const counts = [await rows(usageSyncBatches), await rows(usageDayReports), await rows(usageRecords)];
    const again = await ok<{ status: string }>(post("/api/usage/upload", body, a.child.token));
    expect(again.status).toBe("duplicate");
    expect([await rows(usageSyncBatches), await rows(usageDayReports), await rows(usageRecords)]).toEqual(counts);

    clock.addMs(31 * 86_400_000); // 31 日使わない
    const expired = await expectSafeError(await post("/api/usage/upload", body, a.child.token), 401, [a.child.token]);
    expect(expired).toMatchObject({ code: "unauthorized", hint: "もう一度 Google でログインしてください" });
  });
});

describe("NET-08: エラーの応答に中身が出ない", () => {
  it("NET-08: 401・403・404（知らない道筋・POST の API を GET）・400（壊れた JSON・形の違い）・uuid でない id・409 のどれも、SQL・パス・スタック・DB の名前を返さない", async () => {
    const a = await newFamily("err");
    const childId = a.child.userId;
    const v = await versionOf(childId, a.parent.token);
    const checks: [Promise<Response>, number][] = [
      [get("/api/auth/me", null), 401],
      [get("/api/auth/me", "not-a-valid-token"), 401],
      [post("/api/plan/save", { childId }, a.child.token), 403],
      [get("/api/does-not-exist", a.parent.token), 404],
      [get("/api/plan/get", a.parent.token), 404], // POST の API を GET で
      [postRaw("/api/plan/get", "{not json", a.parent.token), 400],
      [post("/api/plan/get", { childId: 123 }, a.parent.token), 400],
      [post("/api/plan/get", [], a.parent.token), 400],
      [post("/api/pair/status", { pairId: "not-a-uuid" }, a.parent.token), 404],
      [post("/api/test-period/delete", { childId, expectedVersion: v, id: "not-a-uuid" }, a.parent.token), 404],
      [
        post(
          "/api/blank-period/delete",
          { childId, expectedVersion: v, id: "00000000-0000-4000-8000-00000000ffff" },
          a.parent.token,
        ),
        404,
      ],
      [post("/api/test-period/create", { childId, expectedVersion: v + 9, ...period("x") }, a.parent.token), 409],
    ];
    for (const [res, status] of checks) {
      const r = await res;
      const e = await expectSafeError(r, status, [a.parent.token, a.child.token]);
      expect(r.headers.get("x-powered-by")).toBeNull();
      if (e.issues) for (const i of e.issues) expectNoLeak(i.message);
    }
  });
});

// ═════════════════════════ E. 可用性・濫用耐性（サーバ側・低頻度） ═════════════════════════

describe("AVL-01: 回数の上限", () => {
  it("AVL-01: QR の番号の読み取りは、まちがいが続くと 20 回以内に 429 になる。上限は人ごとで、ほかの人は止まらない", async () => {
    const p = await newPerson("rl-p");
    const other = await newPerson("rl-o");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post("/api/pair/claim", { code: `wrong-${i}` }, p.token)).status);
    expect(statuses).toContain(429);
    expect((await post("/api/pair/claim", { code: "wrong-x" }, other.token)).status).toBe(404);
  });

  // 穴（P2）: ログイン・QR を出す・利用記録の送信・設定の取得には回数の上限がない（20 回続けてもすべて受け付ける）
  it.fails("AVL-01: ログイン（authGoogle）を 20 回続けると、どこかで 429 になる", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++)
      statuses.push((await post("/api/auth/google", { idToken: `mock-new-flood-${i}` }, null)).status);
    expect(statuses).toContain(429);
  });

  it.fails("AVL-01: QR を出す（pairStart）を 20 回続けると、どこかで 429 になる", async () => {
    const kid = await newPerson("flood-kid");
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) statuses.push((await post("/api/pair/start", {}, kid.token)).status);
    expect(statuses).toContain(429);
  });

  it.fails("AVL-01: 利用記録の送信（usageUpload・送信 ID を毎回変える）を 20 回続けると、どこかで 429 になる", async () => {
    const a = await newFamily("flood-u");
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const at = new Date(Date.parse("2026-10-15T01:00:00Z") + i * 60_000).toISOString();
      statuses.push(
        (
          await post(
            "/api/usage/upload",
            usageBody(a.child.userId, [usageApp("com.a", "A", i)], TODAY, at),
            a.child.token,
          )
        ).status,
      );
    }
    expect(statuses).toContain(429);
  });

  it("AVL-01（記録）: 上の3つは今は 20 回とも 200。ログインは 20 人分の利用者を作る。利用記録は送信 ID を変えても日ごとの行は増えない", async () => {
    const usersBefore = await rows(users);
    const s1: number[] = [];
    for (let i = 0; i < 20; i++)
      s1.push((await post("/api/auth/google", { idToken: `mock-new-rec-${i}` }, null)).status);
    expect(new Set(s1)).toEqual(new Set([200]));
    expect(await rows(users)).toBe(usersBefore + 20);
    const a = await newFamily("rec-u");
    const reportsBefore = await rows(usageDayReports);
    const batchesBefore = await rows(usageSyncBatches);
    const s2: number[] = [];
    for (let i = 0; i < 20; i++) {
      const at = new Date(Date.parse("2026-10-15T01:00:00Z") + i * 60_000).toISOString();
      s2.push(
        (
          await post(
            "/api/usage/upload",
            usageBody(a.child.userId, [usageApp("com.a", "A", i)], TODAY, at),
            a.child.token,
          )
        ).status,
      );
    }
    expect(new Set(s2)).toEqual(new Set([200]));
    expect(await rows(usageDayReports)).toBe(reportsBefore + 1);
    expect(await rows(usageSyncBatches)).toBe(batchesBefore + 20); // 送信 ID の行は送るたびに 1 つ増える（中身の行は増えない）
  });
});

describe("AVL-02: 同じ QR の二重送信", () => {
  it("AVL-02: 同じ QR を 2 人の保護者が同時に読むと 1 人だけ成功し、確定を同時に 2 回送ってもつながりは 1 つだけ", async () => {
    const kid = await newPerson("dup-kid");
    const p1 = await newPerson("dup-p1");
    const p2 = await newPerson("dup-p2");
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, kid.token)));
    const claims = await Promise.all([
      post("/api/pair/claim", { code: ticket.code }, p1.token),
      post("/api/pair/claim", { code: ticket.code }, p2.token),
    ]);
    expect(claims.map((r) => r.status).sort()).toEqual([200, 409]);
    const confirms = await Promise.all([
      post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token),
      post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, kid.token),
    ]);
    expect(confirms.map((r) => r.status).sort()).toEqual([200, 409]);
    const links = await (await db()).select().from(familyLinks).where(eq(familyLinks.childId, kid.userId));
    expect(links).toHaveLength(1);
  });
});

describe("AVL-04: DB が止まったとき", () => {
  // DB をプロセスの中で「つながらない」状態にする（src/server/db の接続の Promise を、失敗する Promise に差し替える）。
  // 終わったら必ず元に戻す。本物の DB・ネットワークには触らない
  const g = globalThis as unknown as { __slopeRuntimeDb?: Promise<unknown> };
  const FAKE_SECRET = "postgresql://slope_user:FAKE-PASSWORD-123@db.internal.example:5432/slope";
  async function withDbDown<T>(fn: () => Promise<T>): Promise<T> {
    await db(); // 開いておく
    const saved = g.__slopeRuntimeDb;
    const down = Promise.reject(
      Object.assign(new Error(`connect ECONNREFUSED 10.0.0.5:5432 (${FAKE_SECRET})`), { code: "ECONNREFUSED" }),
    );
    down.catch(() => {});
    g.__slopeRuntimeDb = down;
    try {
      return await fn();
    } finally {
      g.__slopeRuntimeDb = saved;
    }
  }

  it("AVL-04: DB が止まると、通常の API は秘密・接続先・例外を含まない一般的なエラーを返す。戻すと正常に戻る", async () => {
    const a = await newFamily("down");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await withDbDown(async () => {
      for (const res of [
        await post("/api/plan/get", { childId: a.child.userId }, a.parent.token),
        await post("/api/usage/upload", usageBody(a.child.userId, []), a.child.token),
        await post("/api/auth/google", { idToken: "mock-new-down" }, null),
        await get("/api/health", null),
      ]) {
        const text = await res.text();
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(ApiError.parse(JSON.parse(text)).code).toBe("internal");
        expectNoLeak(text, ["FAKE-PASSWORD-123", "db.internal.example", "10.0.0.5", a.parent.token]);
      }
    });
    expect((await get("/api/health", null)).status).toBe(200);
    await ok(post("/api/plan/get", { childId: a.child.userId }, a.parent.token));
  });

  // 穴（軽い）: health は DB が止まっても 503 ではなく 500（internal）を返す（backend/src/server.ts の /health は 503）
  it.fails("AVL-04: DB が止まると health は 503 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await withDbDown(async () => (await get("/api/health", null)).status);
    expect(status).toBe(503);
  });
});

// ═════════════════════════ IPA ═════════════════════════

describe("IPA-08: HTTP ヘッダー（該当機能なし。補足の確認）", () => {
  it("IPA-08: 入力に改行と X-Slope-Test を入れても、応答のヘッダーには出ない（利用者の入力をヘッダーに使う所がない）", async () => {
    const kid = await newPerson("hdr");
    for (const name of ["x%0d%0aX-Slope-Test: marker", "x\r\nX-Slope-Test: marker"]) {
      const res = await post("/api/pair/start", { name }, kid.token);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-slope-test")).toBeNull();
      expect([...res.headers.keys()].sort()).toEqual(["content-type"]);
    }
  });
});

describe("IPA-09: CSRF（Cookie を使わない。補足の確認）", () => {
  it("IPA-09: Cookie だけ・別のオリジンからの更新は 401。応答に Set-Cookie も CORS の許可も付かない", async () => {
    const a = await newFamily("csrf");
    const v = await versionOf(a.child.userId, a.parent.token);
    const res = await app.request("/api/plan/usual-limit", {
      method: "POST",
      body: JSON.stringify({ childId: a.child.userId, expectedVersion: v, usualLimitMinutes: 1 }),
      headers: {
        "Content-Type": "text/plain",
        Cookie: `session=${a.parent.token}; token=${a.parent.token}`,
        Origin: "http://evil.localhost",
      },
    });
    await expectSafeError(res, 401, [a.parent.token]);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await app.request("/api/plan/usual-limit", {
      method: "OPTIONS",
      headers: { Origin: "http://evil.localhost", "Access-Control-Request-Method": "POST" },
    });
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    expect(await versionOf(a.child.userId, a.parent.token)).toBe(v);
  });
});

describe("IPA-12: 入力ファジング（少数）", () => {
  it("IPA-12: 欠け・型違い・境界・未知の項目・上限+1 の 20 件は、どれも 4xx で、5xx にならない。その後も正常に動く", async () => {
    const a = await newFamily("fuzz");
    const childId = a.child.userId;
    const P = a.parent.token;
    const C = a.child.token;
    const cases: [string, unknown, string | null][] = [
      ["/api/auth/google", {}, null],
      ["/api/auth/google", { idToken: 1 }, null],
      ["/api/auth/google", null, null],
      ["/api/auth/sign-out", { otherDevices: "yes" }, P],
      ["/api/pair/start", { name: 123 }, C],
      ["/api/pair/claim", { code: "" }, P],
      ["/api/pair/confirm", { pairId: "x", accept: "true" }, C],
      ["/api/plan/save", { childId, expectedVersion: 0, planStartDate: TODAY, startLimitMinutes: 10 }, P],
      [
        "/api/plan/save",
        { childId, expectedVersion: 0, planStartDate: TODAY, startLimitMinutes: 10, finalGoalMinutes: 20 },
        P,
      ],
      ["/api/test-period/create", { childId, expectedVersion: "0", ...period("x") }, C],
      [
        "/api/blank-period/create",
        { childId, expectedVersion: 0, name: "x".repeat(121), startDate: TODAY, endDate: TODAY },
        P,
      ],
      ["/api/excluded-apps/save", { childId, expectedVersion: 0, apps: "all" }, P],
      [
        "/api/excluded-apps/save",
        {
          childId,
          expectedVersion: 0,
          apps: Array.from({ length: 501 }, (_, i) => ({ packageName: `p${i}`, label: "l" })),
        },
        P,
      ],
      ["/api/blocked-sites/save", { childId, expectedVersion: 0, sites: ["http://YouTube.com/"] }, P],
      ["/api/usage/upload", { submissionId: "not-uuid", childId, days: [] }, C],
      [
        "/api/usage/upload",
        {
          ...usageBody(childId, []),
          days: Array.from({ length: 8 }, (_, i) => ({
            date: `2026-10-0${i + 1}`,
            measuredAt: "2026-10-15T00:00:00Z",
            restrictedMinutes: 0,
            apps: [],
          })),
        },
        C,
      ],
      ["/api/child-apps/icons/upload", { childId, icons: [] }, C],
      ["/api/child-apps/icons/get", { childId, packageNames: Array.from({ length: 51 }, (_, i) => `p${i}`) }, P],
      ["/api/device-status/report", { childId, permissions: { usageAccess: true }, measuredAt: "now" }, C],
      ["/api/config/get", { childId, knownVersion: -1, extra: { __proto__: { admin: true } } }, C],
    ];
    expect(cases).toHaveLength(20);
    for (const [path, body, token] of cases) {
      const res = await post(path, body, token);
      const text = await res.text();
      expect(res.status, `${path} ${text}`).toBeGreaterThanOrEqual(400);
      expect(res.status, `${path} ${text}`).toBeLessThan(500);
      expectNoLeak(text, [P, C]);
    }
    expect((await get("/api/health", null)).status).toBe(200);
    await ok(post("/api/plan/get", { childId }, P));
  });
});

describe("IPA-15: 破壊的な操作", () => {
  it("IPA-15: 親A は子B を外せず・子B のテスト期間を消せない。子どもは外す操作ができない。古い版の削除は 409。どれも相手のデータは残る", async () => {
    const { a, b } = await twoFamilies();
    expect((await createPeriod(b, "Bのテスト")).status).toBe(200);
    const vB = await versionOf(b.child.userId, b.parent.token);
    const bList = await ok<{ testPeriods: { id: string }[] }>(
      post("/api/test-period/list", { childId: b.child.userId }, b.parent.token),
    );
    const bId = bList.testPeriods[0]?.id ?? "";
    const vA = await versionOf(a.child.userId, a.parent.token);

    await expectSafeError(await post("/api/family/unlink", { childId: b.child.userId }, a.parent.token), 403);
    await expectSafeError(await post("/api/family/unlink", { childId: a.child.userId }, a.child.token), 403);
    await expectSafeError(await post("/api/family/unlink", { childId: b.child.userId }, b.child.token), 403);
    await expectSafeError(
      await post("/api/test-period/delete", { childId: b.child.userId, expectedVersion: vB, id: bId }, a.parent.token),
      403,
    );
    await expectSafeError(
      await post("/api/test-period/delete", { childId: a.child.userId, expectedVersion: vA, id: bId }, a.parent.token),
      404,
    );
    await expectSafeError(
      await post(
        "/api/test-period/delete",
        { childId: b.child.userId, expectedVersion: vB - 1, id: bId },
        b.parent.token,
      ),
      409,
    );
    await expectSafeError(
      await post("/api/blank-period/delete", { childId: b.child.userId, expectedVersion: vB, id: bId }, a.parent.token),
      403,
    );
    // ほかの人の合言葉を「ほかの端末からログアウト」で消すことはできない（自分の分だけ）
    await ok(post("/api/auth/sign-out", { otherDevices: true }, a.parent.token));
    expect((await get("/api/auth/me", b.parent.token)).status).toBe(200);

    const after = await ok<{ testPeriods: { id: string }[] }>(
      post("/api/test-period/list", { childId: b.child.userId }, b.parent.token),
    );
    expect(after.testPeriods.map((p) => p.id)).toEqual([bId]);
    expect(await rows(familyLinks)).toBe(3); // デモの1組 + A + B
  });
});

// ═════════════════════════ PII-10（サーバ側） ═════════════════════════

describe("PII-10: 連携を外した後の残り", () => {
  it("PII-10: 外すと子どもの合言葉は 401。送信待ちの記録を送り直しても保存されず（復活しない）。外した親は利用記録・端末の許可の状態をもう読めない", async () => {
    const a = await newFamily("pii");
    const childId = a.child.userId;
    await ok(post("/api/usage/upload", usageBody(childId, [usageApp("com.a", "A")]), a.child.token));
    await ok(
      post(
        "/api/device-status/report",
        {
          childId,
          permissions: { usageAccess: true, overlay: true, notifications: true, accessibility: true },
          measuredAt: "2026-10-15T02:00:00Z",
        },
        a.child.token,
      ),
    );
    const before = await rows(usageSyncBatches);
    await ok(post("/api/family/unlink", { childId }, a.parent.token));

    const pending = usageBody(childId, [usageApp("com.b", "B")], TODAY, "2026-10-15T02:30:00.000Z");
    await expectSafeError(await post("/api/usage/upload", pending, a.child.token), 401);
    expect(await rows(usageSyncBatches)).toBe(before);
    await expectSafeError(await post("/api/usage/get", { childId, from: TODAY, to: TODAY }, a.parent.token), 403);
    await expectSafeError(await post("/api/device-status/get", { childId }, a.parent.token), 403);
    // 子どもがログインし直すと役割なし。送信待ちを送っても 403（保存されない）
    const again = await newPerson("c-pii");
    expect(again.role).toBeNull();
    await expectSafeError(await post("/api/usage/upload", pending, again.token), 403);
    expect(await rows(usageSyncBatches)).toBe(before);
  });

  it("PII-10（記録・仕様未決）: 外した後も利用記録・端末のアプリ一覧はサーバに残り、子どもが別の保護者と紐づけ直すと、その保護者に前の記録が見える", async () => {
    const a = await newFamily("keep");
    const childId = a.child.userId;
    await ok(
      post("/api/usage/upload", usageBody(childId, [usageApp("com.secret", "前の家庭で使ったアプリ")]), a.child.token),
    );
    await ok(
      post(
        "/api/child-apps/upload",
        { childId, apps: [{ packageName: "com.secret", label: "前のアプリ" }] },
        a.child.token,
      ),
    );
    await ok(post("/api/family/unlink", { childId }, a.parent.token));
    const kid = await newPerson("c-keep");
    const otherParent = await newPerson("other-parent");
    await link(kid.token, otherParent.token);
    const seen = await ok<{ days: { apps: { label: string }[] }[] }>(
      post("/api/usage/get", { childId, from: TODAY, to: TODAY }, otherParent.token),
    );
    expect(seen.days[0]?.apps.map((x) => x.label)).toEqual(["前の家庭で使ったアプリ"]);
    const apps = await ok<{ apps: { label: string }[] }>(post("/api/child-apps/get", { childId }, otherParent.token));
    expect(apps.apps.map((x) => x.label)).toEqual(["前のアプリ"]);
  });
});
