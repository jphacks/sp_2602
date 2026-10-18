// 確かめ役（V）: 子どもの利用記録（C8）が、送るたびに DB に増え続けないこと（セキュリティ自己点検 🟠4）。
// 前は backend/src/db/usage-persistence.ts が、採用されなかった日（前に届いた記録より古い測定）の分も含めて、
// 送るたびに全部の行を新しく入れていた（消す処理なし）。送信 ID を変えれば、1回で最大 7日×1000 アプリ = 7000 行を
// 何度でも書けた。日付も 0001〜9999 年のどれでも通った。
// 決まり（C8・Q8）: 日ごとに「測った時刻が一番新しいもの」を正とする。これは変えない。
import { addDays } from "@contracts/dates";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { usageDayReports, usageRecords, usageSyncBatches } from "../../backend/src/db/schema/usage";
import { CHILD, CHILD_ID, codeOf, fresh, ok, PARENT, post } from "./helpers";

// 日本時間 2026-10-15 12:00
const TODAY = "2026-10-15";
const NOW = "2026-10-15T03:00:00.000Z";

beforeEach(async () => {
  const d = await fresh(NOW);
  // 見本（seedDemoFamily）の過去6日の記録を消して、このテストで送った行だけを数える
  await d.delete(usageRecords).where(eq(usageRecords.childId, CHILD_ID));
  await d.delete(usageDayReports).where(eq(usageDayReports.childId, CHILD_ID));
  await d.delete(usageSyncBatches).where(eq(usageSyncBatches.childId, CHILD_ID));
});

const apps = (n: number, minutes: number) =>
  Array.from({ length: n }, (_, i) => ({
    packageName: `com.example.app${i}`,
    label: `アプリ${i}`,
    usedMinutes: minutes,
    excluded: false,
  }));

const day = (date: string, measuredAt: string, minutes: number, appCount = 2) => ({
  date,
  measuredAt,
  restrictedMinutes: minutes,
  apps: apps(appCount, minutes),
});

type UploadResult = { status: string; appliedDates: string[] };
const upload = (days: unknown[], submissionId: string = crypto.randomUUID()) =>
  post("/api/usage/upload", { submissionId, childId: CHILD_ID, days }, CHILD);

// この子どもの、その日の行の数（日ごとの記録・アプリごとの記録）
async function rowsOf(date?: string) {
  const d = await db();
  const reportWhere = date
    ? and(eq(usageDayReports.childId, CHILD_ID), eq(usageDayReports.usageDate, date))
    : eq(usageDayReports.childId, CHILD_ID);
  const appWhere = date
    ? and(eq(usageRecords.childId, CHILD_ID), eq(usageRecords.usageDate, date))
    : eq(usageRecords.childId, CHILD_ID);
  const [reports] = await d.select({ n: count() }).from(usageDayReports).where(reportWhere);
  const [records] = await d.select({ n: count() }).from(usageRecords).where(appWhere);
  return { reports: reports?.n ?? 0, records: records?.n ?? 0 };
}

const view = async (date: string) =>
  (
    await ok<{ days: { usedMinutes: number | null; measuredAt: string | null; apps: { usedMinutes: number }[] }[] }>(
      post("/api/usage/get", { childId: CHILD_ID, from: date, to: date }, PARENT),
    )
  ).days[0];

describe("V: 利用記録は、同じ子ども・同じ日・同じアプリの古い行を残さない（🟠4）", () => {
  it("同じ日の記録を新しい送信 ID で何度送っても、その日の行は日ごとに1つ・アプリごとに1つだけ。親には一番新しい測定が見える", async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await ok<UploadResult>(upload([day(TODAY, `2026-10-15T02:0${i}:00.000Z`, i * 10)]));
      expect(r.appliedDates).toEqual([TODAY]);
    }
    expect(await rowsOf(TODAY)).toEqual({ reports: 1, records: 2 });
    expect(await view(TODAY)).toMatchObject({
      usedMinutes: 50,
      measuredAt: "2026-10-15T02:05:00.000Z",
      apps: [{ usedMinutes: 50 }, { usedMinutes: 50 }],
    });
  });

  it("採用されなかった日（前に届いた記録より古い・同じ時刻の測定）の行は保存しない。前の記録はそのまま", async () => {
    await ok(upload([day(TODAY, "2026-10-15T02:30:00.000Z", 40)]));
    for (const measuredAt of ["2026-10-15T02:00:00.000Z", "2026-10-15T02:30:00.000Z"]) {
      const r = await ok<UploadResult>(upload([day(TODAY, measuredAt, 5)]));
      expect(r).toMatchObject({ status: "accepted", appliedDates: [] });
    }
    expect(await rowsOf(TODAY)).toEqual({ reports: 1, records: 2 });
    expect(await view(TODAY)).toMatchObject({ usedMinutes: 40, measuredAt: "2026-10-15T02:30:00.000Z" });
  });

  it("7日×たくさんのアプリを、送信 ID を変えて何度送っても、行の数は1回分から増えない", async () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(TODAY, -i));
    const send = (measuredAt: string) => upload(dates.map((date) => day(date, measuredAt, 30, 150)));
    await ok(send("2026-10-15T01:00:00.000Z"));
    const once = await rowsOf();
    expect(once).toEqual({ reports: 7, records: 7 * 150 });
    await ok(send("2026-10-15T01:30:00.000Z")); // 新しい測定（置き換え）
    await ok(send("2026-10-15T00:30:00.000Z")); // 古い測定（採用されない）
    await ok(send("2026-10-15T02:00:00.000Z")); // 新しい測定（置き換え）
    expect(await rowsOf()).toEqual(once);
  });

  it("ある日だけ新しい記録が届いたら、その日だけ置き換え、ほかの日は前の送信の記録が残る", async () => {
    const yesterday = addDays(TODAY, -1);
    await ok(upload([day(yesterday, "2026-10-14T14:00:00.000Z", 70), day(TODAY, "2026-10-15T01:00:00.000Z", 10)]));
    await ok(upload([day(TODAY, "2026-10-15T02:00:00.000Z", 20)]));
    expect(await rowsOf(yesterday)).toEqual({ reports: 1, records: 2 });
    expect(await rowsOf(TODAY)).toEqual({ reports: 1, records: 2 });
    expect((await view(yesterday))?.usedMinutes).toBe(70);
    expect((await view(TODAY))?.usedMinutes).toBe(20);
  });

  it("置き換えられた前の送信を同じ送信 ID・同じ中身で送り直しても duplicate（二重に入らない）。中身を変えたら conflict", async () => {
    const firstId = crypto.randomUUID();
    const first = [day(TODAY, "2026-10-15T01:00:00.000Z", 10)];
    await ok(upload(first, firstId));
    await ok(upload([day(TODAY, "2026-10-15T02:00:00.000Z", 20)]));
    const retry = await ok<UploadResult>(upload(first, firstId));
    expect(retry).toMatchObject({ status: "duplicate", appliedDates: [TODAY] });
    expect(await rowsOf(TODAY)).toEqual({ reports: 1, records: 2 });
    expect((await view(TODAY))?.usedMinutes).toBe(20);
    const changed = await upload([day(TODAY, "2026-10-15T01:00:00.000Z", 11)], firstId);
    expect(changed.status).toBe(409);
  });
});

describe("V: 利用記録の日付は、保存期間（今日から190日前）〜明日だけを受け付ける（🟠4）", () => {
  it("190日より前の日・明日より先の日（0001 年・9999 年を含む）は bad_request で、何も保存しない", async () => {
    for (const date of ["0001-01-01", "9999-12-31", addDays(TODAY, -191), addDays(TODAY, 2), "2099-01-01"]) {
      const res = await upload([day(date, "2026-10-15T02:00:00.000Z", 10)]);
      expect(res.status, date).toBe(400);
      expect(await codeOf(res)).toBe("bad_request");
    }
    // ふつうの日と一緒に送っても、送信ごと断る（一部だけ保存しない）
    const mixed = await upload([
      day(TODAY, "2026-10-15T02:00:00.000Z", 10),
      day("9999-12-31", "2026-10-15T02:00:00.000Z", 10),
    ]);
    expect(mixed.status).toBe(400);
    expect(await rowsOf()).toEqual({ reports: 0, records: 0 });
    const d = await db();
    const [batches] = await d
      .select({ n: count() })
      .from(usageSyncBatches)
      .where(eq(usageSyncBatches.childId, CHILD_ID));
    expect(batches?.n).toBe(0);
  });

  it("ちょうど190日前と明日（端末の時計が少し進んでいる）は受け付ける", async () => {
    for (const date of [addDays(TODAY, -190), addDays(TODAY, 1), TODAY]) {
      const r = await ok<UploadResult>(upload([day(date, "2026-10-15T02:00:00.000Z", 10)]));
      expect(r.appliedDates, date).toEqual([date]);
    }
  });
});
