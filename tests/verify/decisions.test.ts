// 確かめ役（V）: 人間が決めた「仕様の決定 Q1〜Q14」のうち、サーバと仕組みで確かめられるものを点検する（plan.md）。
// 画面だけで決まるもの（Q12 の下部タブ・Q13 の設定画面の項目）は対象外。

import { addDays, dateOf, todayString } from "@contracts/dates";
import { mockSessions } from "@contracts/fixtures";
import { type BlankPeriod, type DailyLimit, PlanSave, TestPeriodCreate } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { CHILD, CHILD_ID, clock, fresh, get, newFamily, newPerson, ok, PARENT, post, versionOf } from "./helpers";

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z");
});

type Snap = { configVersion: number; dailyLimits: DailyLimit[]; usualLimitMinutes: number | null };
const snapshotOf = async (childId: string, token: string, knownVersion?: number) =>
  ok<{ changed: boolean; snapshot?: Snap; configVersion?: number }>(
    post("/api/config/get", { childId, knownVersion }, token),
  );

describe("V: Q1 役割は QR の紐づけで確定する", () => {
  it("ログインしただけでは role: null。QR の確定で、出した人が child・読んだ人が parent", async () => {
    const { child, parent } = await newFamily("q1");
    expect((await ok<{ role: string }>(get("/api/auth/me", child.token))).role).toBe("child");
    expect((await ok<{ role: string }>(get("/api/auth/me", parent.token))).role).toBe("parent");
    const fresh1 = await newPerson("q1-new");
    expect(fresh1.role).toBeNull();
  });

  it("同じ人がもう一度ログインしても、確定した役割は変わらない（新しい合言葉でも parent のまま）", async () => {
    const { parent } = await newFamily("q1b");
    const again = await newPerson("p-q1b");
    expect(again.userId).toBe(parent.userId);
    expect(again.role).toBe("parent");
  });
});

describe("V: Q2 親1人↔子1人・形は一覧", () => {
  it("familyGet は一覧の形で1人だけ。2人目の子どもの紐づけは conflict", async () => {
    const { child, parent } = await newFamily("q2");
    const fam = await ok<{ children: { id: string }[] }>(get("/api/family/get", parent.token));
    expect(fam.children.map((c) => c.id)).toEqual([child.userId]);
    const c2 = await newPerson("q2-c2");
    const t = await ok<{ code: string }>(post("/api/pair/start", {}, c2.token));
    expect((await post("/api/pair/claim", { code: t.code }, parent.token)).status).toBe(409);
    // 連携済みの子どもを、別の保護者が読むこともできない（子どもは QR を出せない）
    expect((await post("/api/pair/start", {}, child.token)).status).toBe(409);
  });
});

describe("V: Q3 日付は Asia/Tokyo 固定・0:00 区切り", () => {
  it("UTC 14:59:59 は日本の同じ日、15:00:00 は翌日", () => {
    expect(todayString(new Date("2026-10-15T14:59:59.999Z"))).toBe("2026-10-15");
    expect(todayString(new Date("2026-10-15T15:00:00.000Z"))).toBe("2026-10-16");
    expect(dateOf(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("サーバの「今日」も日本時間: UTC 15:00 を過ぎてから保存すると、日別上限は翌日から始まる", async () => {
    await fresh("2026-10-15T15:00:00Z"); // 日本時間 10/16 0:00
    const { child, parent } = await newFamily("q3");
    const v = await versionOf(child.userId, parent.token);
    await ok(
      post("/api/plan/usual-limit", { childId: child.userId, expectedVersion: v, usualLimitMinutes: 60 }, parent.token),
    );
    const r = await snapshotOf(child.userId, child.token);
    expect(r.snapshot?.dailyLimits[0]?.date).toBe("2026-10-16");
    // 計画開始日の「今日以降」も日本時間で判断する（10/15 は昨日なので断る）
    const v2 = await versionOf(child.userId, parent.token);
    const past = await post(
      "/api/plan/save",
      {
        childId: child.userId,
        expectedVersion: v2,
        planStartDate: "2026-10-15",
        startLimitMinutes: 60,
        finalGoalMinutes: 30,
      },
      parent.token,
    );
    expect(past.status).toBe(400);
  });
});

describe("V: Q5・Q6 保存と C10 は1回の処理・版は子ども1人に1本", () => {
  it("設定を変える9種類の操作は、どれも版をちょうど 1 上げる", async () => {
    const { child, parent } = await newFamily("q6");
    const childId = child.userId;
    let v = await versionOf(childId, parent.token);
    const step = async (path: string, body: object, token = parent.token) => {
      const r = await ok<{ configVersion: number }>(post(path, { childId, expectedVersion: v, ...body }, token));
      expect(r.configVersion, path).toBe(v + 1);
      v = r.configVersion;
      return r;
    };
    await step("/api/plan/usual-limit", { usualLimitMinutes: 120 });
    await step("/api/plan/save", { planStartDate: "2026-10-15", startLimitMinutes: 200, finalGoalMinutes: 60 });
    const t = (await step(
      "/api/test-period/create",
      { name: "a", startDate: "2026-11-01", endDate: "2026-11-02" },
      child.token,
    )) as unknown as { testPeriod: { id: string } };
    await step("/api/test-period/update", {
      id: t.testPeriod.id,
      name: "b",
      startDate: "2026-11-03",
      endDate: "2026-11-04",
    });
    const b = (await step("/api/blank-period/create", {
      name: "休み",
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    })) as unknown as { blankPeriod: { id: string } };
    await step("/api/blank-period/update", {
      id: b.blankPeriod.id,
      name: "休み2",
      startDate: "2026-12-03",
      endDate: "2026-12-04",
    });
    await step("/api/blank-period/delete", { id: b.blankPeriod.id });
    await step("/api/excluded-apps/save", { apps: [{ packageName: "a.b", label: "A" }] });
    await step("/api/test-period/delete", { id: t.testPeriod.id }, child.token);
  });

  it("子どもが configGet で送った版が、計画・テスト・空白期間・対象外アプリの取得結果の childAppliedVersion に出る", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    // まだ一度も版を送っていない
    expect(
      (await ok<{ childAppliedVersion: number | null }>(post("/api/plan/get", { childId: CHILD_ID }, PARENT)))
        .childAppliedVersion,
    ).toBeNull();
    // 1回目は版を持っていないので送らない → まだ null
    await snapshotOf(CHILD_ID, CHILD);
    expect(
      (await ok<{ childAppliedVersion: number | null }>(post("/api/plan/get", { childId: CHILD_ID }, PARENT)))
        .childAppliedVersion,
    ).toBeNull();
    // 2回目に「今使っている版」を送る → 反映済み
    expect(await snapshotOf(CHILD_ID, CHILD, v)).toEqual({ changed: false, configVersion: v });
    for (const path of ["/api/plan/get", "/api/test-period/list", "/api/blank-period/list", "/api/excluded-apps/get"]) {
      const r = await ok<{ childAppliedVersion: number | null; configVersion: number }>(
        post(path, { childId: CHILD_ID }, PARENT),
      );
      expect(r, path).toMatchObject({ childAppliedVersion: v, configVersion: v });
    }
  });

  it("親が configGet を呼んでも「子どもが使っている版」は変わらない。子どもがサーバより先の版を送っても記録しない", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    await snapshotOf(CHILD_ID, CHILD, v - 1);
    await snapshotOf(CHILD_ID, PARENT, v);
    await snapshotOf(CHILD_ID, CHILD, v + 5);
    const r = await ok<{ childAppliedVersion: number | null }>(post("/api/plan/get", { childId: CHILD_ID }, PARENT));
    expect(r.childAppliedVersion).toBe(v - 1);
  });
});

describe("V: Q7 通常上限・空白期間・「制限なし」と「未設定」と「0 分」の区別", () => {
  it("紐づけ直後は usualLimitMinutes: null・日別上限なし（未設定）。0 分を決めると 0 分の上限（未設定ではない）", async () => {
    const { child, parent } = await newFamily("q7");
    const before = await snapshotOf(child.userId, child.token);
    expect(before.snapshot).toMatchObject({ usualLimitMinutes: null, dailyLimits: [] });
    const v = await versionOf(child.userId, parent.token);
    await ok(
      post("/api/plan/usual-limit", { childId: child.userId, expectedVersion: v, usualLimitMinutes: 0 }, parent.token),
    );
    const after = await snapshotOf(child.userId, child.token);
    expect(after.snapshot?.usualLimitMinutes).toBe(0);
    expect(after.snapshot?.dailyLimits[0]).toEqual({ date: "2026-10-15", kind: "limited", limitMinutes: 0 });
  });

  it("空白期間は保護者だけ。子どもは作れないが、configGet で見られる", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const body = {
      childId: CHILD_ID,
      expectedVersion: v,
      name: "夏休み",
      startDate: "2026-10-20",
      endDate: "2026-10-21",
    };
    expect((await post("/api/blank-period/create", body, CHILD)).status).toBe(403);
    const created = await ok<{ blankPeriod: BlankPeriod }>(post("/api/blank-period/create", body, PARENT));
    const snap = (await snapshotOf(CHILD_ID, CHILD)) as unknown as {
      snapshot: { blankPeriods: BlankPeriod[]; dailyLimits: DailyLimit[] };
    };
    expect(snap.snapshot.blankPeriods).toEqual([created.blankPeriod]);
    // 保存された空白期間に childId・expectedVersion などの余計な項目が入らない
    expect(Object.keys(created.blankPeriod).sort()).toEqual(["endDate", "id", "name", "startDate"]);
    expect(snap.snapshot.dailyLimits.find((l) => l.date === "2026-10-20")?.kind).toBe("unlimited");
    expect(snap.snapshot.dailyLimits.find((l) => l.date === "2026-10-22")?.kind).toBe("limited");
  });

  it("親の実績（usageGet）でも、空白期間の日は limit: unlimited、上限のない日は null、0 分は limited 0", async () => {
    const { child, parent } = await newFamily("q7c");
    const id = child.userId;
    let v = await versionOf(id, parent.token);
    v = (
      await ok<{ configVersion: number }>(
        post("/api/plan/usual-limit", { childId: id, expectedVersion: v, usualLimitMinutes: 0 }, parent.token),
      )
    ).configVersion;
    await ok(
      post(
        "/api/blank-period/create",
        { childId: id, expectedVersion: v, name: "休", startDate: "2026-10-16", endDate: "2026-10-16" },
        parent.token,
      ),
    );
    const view = await ok<{ days: { date: string; limit: unknown }[] }>(
      post("/api/usage/get", { childId: id, from: "2026-10-14", to: "2026-10-17" }, parent.token),
    );
    expect(view.days.map((d) => d.limit)).toEqual([
      null, // 10/14: 昨日以前で作っていない = 未設定
      { kind: "limited", limitMinutes: 0 },
      { kind: "unlimited", blankPeriodId: expect.any(String) },
      { kind: "limited", limitMinutes: 0 },
    ]);
  });
});

describe("V: Q8 利用記録（今日と昨日・日ごとに新しい測定が勝つ）", () => {
  const day = (date: string, measuredAt: string, minutes: number) => ({
    date,
    measuredAt,
    restrictedMinutes: minutes,
    apps: [{ packageName: "x.y", label: "X", usedMinutes: minutes, excluded: false }],
  });

  it("2日分を1回で送ると、日ごとに判断する（昨日は古いので捨て、今日は新しいので採用）", async () => {
    await ok(
      post(
        "/api/usage/upload",
        {
          submissionId: crypto.randomUUID(),
          childId: CHILD_ID,
          days: [day("2026-10-14", "2026-10-14T14:50:00Z", 100)],
        },
        CHILD,
      ),
    );
    const r = await ok<{ appliedDates: string[] }>(
      post(
        "/api/usage/upload",
        {
          submissionId: crypto.randomUUID(),
          childId: CHILD_ID,
          days: [day("2026-10-14", "2026-10-14T13:00:00Z", 90), day("2026-10-15", "2026-10-15T02:00:00Z", 40)],
        },
        CHILD,
      ),
    );
    expect(r.appliedDates).toEqual(["2026-10-15"]);
    const view = await ok<{ days: { usedMinutes: number | null }[] }>(
      post("/api/usage/get", { childId: CHILD_ID, from: "2026-10-14", to: "2026-10-15" }, PARENT),
    );
    expect(view.days.map((d) => d.usedMinutes)).toEqual([100, 40]);
  });

  it("時差の書き方が違っても（+09:00 と Z）、本当の時刻で新しい方が勝つ", async () => {
    await ok(
      post(
        "/api/usage/upload",
        {
          submissionId: crypto.randomUUID(),
          childId: CHILD_ID,
          days: [day("2026-10-15", "2026-10-15T11:00:00+09:00", 10)],
        },
        CHILD,
      ),
    );
    // 03:00Z = 12:00+09:00 なので、こちらが新しい
    const r = await ok<{ appliedDates: string[] }>(
      post(
        "/api/usage/upload",
        { submissionId: crypto.randomUUID(), childId: CHILD_ID, days: [day("2026-10-15", "2026-10-15T03:00:00Z", 20)] },
        CHILD,
      ),
    );
    expect(r.appliedDates).toEqual(["2026-10-15"]);
  });

  it("8日分以上・0日分の送信は bad_request（毎回 今日と昨日。上限7日）", async () => {
    const days = Array.from({ length: 8 }, (_, i) => day(addDays("2026-10-15", -i), "2026-10-15T02:00:00Z", 1));
    expect(
      (await post("/api/usage/upload", { submissionId: crypto.randomUUID(), childId: CHILD_ID, days }, CHILD)).status,
    ).toBe(400);
    expect(
      (await post("/api/usage/upload", { submissionId: crypto.randomUUID(), childId: CHILD_ID, days: [] }, CHILD))
        .status,
    ).toBe(400);
  });
});

describe("V: Q10 QR は10分・1回だけ・出し直すと前は無効", () => {
  it("読まれた（claimed）QR も、出し直すと expired になり、確定できない", async () => {
    const c = await newPerson("q10c");
    const p = await newPerson("q10p");
    const t1 = await ok<{ code: string; pairId: string; expiresAt: string }>(post("/api/pair/start", {}, c.token));
    expect(Date.parse(t1.expiresAt) - clock.ms).toBe(10 * 60_000);
    await ok(post("/api/pair/claim", { code: t1.code }, p.token));
    await ok(post("/api/pair/start", {}, c.token));
    const st = await ok<{ state: string }>(post("/api/pair/status", { pairId: t1.pairId }, p.token));
    expect(st.state).toBe("expired");
    expect((await post("/api/pair/confirm", { pairId: t1.pairId, accept: true }, c.token)).status).toBe(409);
  });

  it("「いいえ」で断られた QR は、もう読めない（1回だけ）", async () => {
    const c = await newPerson("q10r");
    const p = await newPerson("q10rp");
    const t = await ok<{ code: string; pairId: string }>(post("/api/pair/start", {}, c.token));
    await ok(post("/api/pair/claim", { code: t.code }, p.token));
    await ok(post("/api/pair/confirm", { pairId: t.pairId, accept: false }, c.token));
    expect((await post("/api/pair/claim", { code: t.code }, p.token)).status).toBe(409);
  });
});

describe("V 回帰: 不具合4 QR を出すときの呼び名が、紐づけの後に消えた（store.pairConfirm）", () => {
  // もとは tests/verify/known-bugs.test.ts（中身と期待値はそのまま）。
  // 原因: 確定後の familyGet・linkStatus・authMe が Google のアカウント名を返していた。直し方: 確定のときに呼び名を子どもの名前として残す
  beforeEach(async () => {
    await fresh("2026-10-15T03:00:00Z");
  });

  it("紐づけの後、保護者の家族一覧・連携状態に出る子どもの名前は、QR を出すときに入れた呼び名", async () => {
    const child = await newPerson("nick-c");
    const parent = await newPerson("nick-p");
    const t = await ok<{ code: string; pairId: string }>(post("/api/pair/start", { name: "たろう" }, child.token));
    const claimed = await ok<{ child: { name: string } }>(post("/api/pair/claim", { code: t.code }, parent.token));
    expect(claimed.child.name).toBe("たろう");
    await ok(post("/api/pair/confirm", { pairId: t.pairId, accept: true }, child.token));
    const fam = await ok<{ children: { name: string }[] }>(get("/api/family/get", parent.token));
    const link = await ok<{ partners: { name: string }[] }>(get("/api/link/status", parent.token));
    expect(fam.children.map((c) => c.name)).toEqual(["たろう"]);
    expect(link.partners.map((p) => p.name)).toEqual(["たろう"]);
  });

  it("子ども本人の authMe も同じ呼び名（端末の表示がそろう）", async () => {
    const child = await newPerson("nick-c2");
    const parent = await newPerson("nick-p2");
    const t = await ok<{ code: string; pairId: string }>(post("/api/pair/start", { name: "はなこ" }, child.token));
    await ok(post("/api/pair/claim", { code: t.code }, parent.token));
    await ok(post("/api/pair/confirm", { pairId: t.pairId, accept: true }, child.token));
    const me = await ok<{ name: string; role: string }>(get("/api/auth/me", child.token));
    expect(me).toMatchObject({ name: "はなこ", role: "child" });
  });
});

describe("V: Q11 子どももテスト期間を追加・変更・削除できる（作った人を残す）", () => {
  it("保護者が作ったテストを子どもが変える・消すことができ、変えても作った人は保護者のまま", async () => {
    let v = await versionOf(CHILD_ID, PARENT);
    const created = await ok<{ testPeriod: { id: string }; configVersion: number }>(
      post(
        "/api/test-period/create",
        { childId: CHILD_ID, expectedVersion: v, name: "親の", startDate: "2026-12-01", endDate: "2026-12-02" },
        PARENT,
      ),
    );
    v = created.configVersion;
    const upd = await ok<{
      testPeriod: { createdByRole: string; createdByUserId: string; name: string };
      configVersion: number;
    }>(
      post(
        "/api/test-period/update",
        {
          childId: CHILD_ID,
          expectedVersion: v,
          id: created.testPeriod.id,
          name: "子が直した",
          startDate: "2026-12-02",
          endDate: "2026-12-03",
        },
        CHILD,
      ),
    );
    expect(upd.testPeriod).toMatchObject({
      createdByRole: "parent",
      createdByUserId: mockSessions["mock-google-parent"].userId,
      name: "子が直した",
    });
    const del = await post(
      "/api/test-period/delete",
      { childId: CHILD_ID, expectedVersion: upd.configVersion, id: created.testPeriod.id },
      CHILD,
    );
    expect(del.status).toBe(200);
  });
});

describe("V: Q14 計画の入力（3つ必須・0〜1440 の整数・G ≤ S・開始日は今日以降）", () => {
  const base = {
    childId: "c",
    expectedVersion: 0,
    planStartDate: "2026-10-15",
    startLimitMinutes: 100,
    finalGoalMinutes: 50,
  };

  it("契約: 0 と 1440 は通る。-1・1441・小数・文字・欠け・G > S は通らない。G = S は通る", () => {
    expect(PlanSave.safeParse({ ...base, startLimitMinutes: 1440, finalGoalMinutes: 0 }).success).toBe(true);
    expect(PlanSave.safeParse({ ...base, startLimitMinutes: 60, finalGoalMinutes: 60 }).success).toBe(true);
    for (const bad of [
      { startLimitMinutes: 1441 },
      { finalGoalMinutes: -1 },
      { startLimitMinutes: 100.5 },
      { startLimitMinutes: "100" },
      { finalGoalMinutes: 101 },
      { planStartDate: "2026-02-30" },
      { planStartDate: undefined },
      { usualLimitMinutes: 1441 },
    ])
      expect(PlanSave.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it("サーバ: 開始日が今日なら通り、昨日なら 400", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const body = { ...base, childId: CHILD_ID, expectedVersion: v };
    expect((await post("/api/plan/save", { ...body, planStartDate: "2026-10-14" }, PARENT)).status).toBe(400);
    expect((await post("/api/plan/save", body, PARENT)).status).toBe(200);
  });

  it("テスト期間の契約: 終了日が開始日より前・名前が空白だけは通らない。同じ日は通る", () => {
    const t = { childId: "c", expectedVersion: 0, name: "x", startDate: "2026-11-02", endDate: "2026-11-02" };
    expect(TestPeriodCreate.safeParse(t).success).toBe(true);
    expect(TestPeriodCreate.safeParse({ ...t, endDate: "2026-11-01" }).success).toBe(false);
    expect(TestPeriodCreate.safeParse({ ...t, name: "   " }).success).toBe(false);
  });
});
