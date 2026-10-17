// 日程の画面がサーバを呼ぶ部分（src/components/schedule/actions.ts）を、メモリ上の MOCK のサーバ（src/server/app.ts）につないで確かめる。
// 本物のネットワークは使わず、fetch を app.request に差し替える。確かめること:
//   - 一覧と今の版が取れる・作成／更新／削除が expectedVersion つきで通り、版が上がる（AC-05: 親子どちらも変えられる）
//   - 古い版で送ると conflict になり、画面は「読み込み直す」を出す（saveFailure）
//   - 送る前の検査（validatePeriod）で止める重なりは、サーバでも断られる（同じ決まり）
//   - 空白期間は保護者だけ（子どもは forbidden → 「保護者だけが変えられます」）
//   - 親05 の「反映済み／反映待ち」は、テスト日程が最後に変わった版で決まる（計画・対象外アプリの保存では反映待ちにならない）
import { mockSessions } from "@contracts/fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePeriod, fetchPeriods, savePeriod } from "@/components/schedule/actions";
import { appliedStatus, saveFailure, validatePeriod } from "@/components/schedule/logic";
import { ApiCallError, call, errorOf, setSessionToken } from "@/lib/api";
import app from "@/server/app";
import { resetStore } from "@/server/mock/store";

const PARENT = mockSessions["mock-google-parent"].token;
const CHILD = mockSessions["mock-google-child"].token;
const CHILD_ID = mockSessions["mock-google-child"].userId;

beforeEach(() => {
  // 時計は日本時間 2026-10-15 12:00（見本のテスト「数学」10/26〜10/28 がある。空白期間はない）
  resetStore({ seed: true, now: () => new Date(Date.parse("2026-10-15T03:00:00Z")) });
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(url, init));
});

afterEach(() => {
  setSessionToken(null);
  vi.unstubAllGlobals();
});

const failureOf = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ApiCallError);
  const error = errorOf(e);
  if (!error) throw new Error("ApiError のはず");
  return error;
};

describe("テスト期間（子どもも変えられる。Q11）", () => {
  it("一覧と今の版が取れ、作成・更新・削除のたびに版が上がる", async () => {
    setSessionToken(CHILD);
    const first = await fetchPeriods("test", CHILD_ID);
    expect(first.periods.map((p) => p.name)).toContain("数学");

    const created = await savePeriod("test", {
      childId: CHILD_ID,
      expectedVersion: first.configVersion,
      name: "英語",
      startDate: "2026-11-10",
      endDate: "2026-11-11",
    });
    expect(created.configVersion).toBe(first.configVersion + 1);

    const afterCreate = await fetchPeriods("test", CHILD_ID);
    const english = afterCreate.periods.find((p) => p.name === "英語");
    expect(english?.createdByRole).toBe("child");
    if (!english) throw new Error("英語があるはず");

    const updated = await savePeriod("test", {
      childId: CHILD_ID,
      expectedVersion: afterCreate.configVersion,
      id: english.id,
      name: "英語（単語）",
      startDate: "2026-11-12",
      endDate: "2026-11-12",
    });
    expect(updated.configVersion).toBe(afterCreate.configVersion + 1);
    const afterUpdate = await fetchPeriods("test", CHILD_ID);
    expect(afterUpdate.periods.find((p) => p.id === english.id)).toMatchObject({
      name: "英語（単語）",
      startDate: "2026-11-12",
      endDate: "2026-11-12",
    });

    await deletePeriod("test", { childId: CHILD_ID, expectedVersion: afterUpdate.configVersion, id: english.id });
    const afterDelete = await fetchPeriods("test", CHILD_ID);
    expect(afterDelete.periods.some((p) => p.id === english.id)).toBe(false);
  });

  it("保護者も同じ一覧を変えられる（AC-05）", async () => {
    setSessionToken(PARENT);
    const list = await fetchPeriods("test", CHILD_ID);
    await savePeriod("test", {
      childId: CHILD_ID,
      expectedVersion: list.configVersion,
      name: "期末",
      startDate: "2026-12-01",
      endDate: "2026-12-03",
    });
    const after = await fetchPeriods("test", CHILD_ID);
    expect(after.periods.find((p) => p.name === "期末")?.createdByRole).toBe("parent");
  });

  it("古い版で送ると conflict。画面は「ほかの端末で変更されました」と読み込み直しを出す", async () => {
    setSessionToken(CHILD);
    const list = await fetchPeriods("test", CHILD_ID);
    // ほかの端末（保護者）が先に変える
    setSessionToken(PARENT);
    await savePeriod("test", {
      childId: CHILD_ID,
      expectedVersion: list.configVersion,
      name: "小テスト",
      startDate: "2026-11-20",
      endDate: "2026-11-20",
    });
    setSessionToken(CHILD);
    const error = await failureOf(
      savePeriod("test", {
        childId: CHILD_ID,
        expectedVersion: list.configVersion,
        name: "英語",
        startDate: "2026-11-10",
        endDate: "2026-11-11",
      }),
    );
    expect(error.code).toBe("conflict");
    const f = saveFailure(error, "test");
    expect(f.action).toBe("reload");
    expect(f.error.message).toContain("ほかの端末で変更されました");
  });

  it("送る前の検査で止める重なりは、サーバでも bad_request で断られる（入力を残して文を出す）", async () => {
    setSessionToken(CHILD);
    const list = await fetchPeriods("test", CHILD_ID);
    const math = list.periods.find((p) => p.name === "数学");
    if (!math) throw new Error("見本の数学があるはず");
    // 数学の最後の日に始まる（1日だけ重なる）
    const draft = { name: "理科", startDate: math.endDate, endDate: "2026-11-01" };
    expect(validatePeriod(draft, list.periods, "test").ok).toBe(false);
    const error = await failureOf(
      savePeriod("test", { childId: CHILD_ID, expectedVersion: list.configVersion, ...draft }),
    );
    expect(error.code).toBe("bad_request");
    expect(saveFailure(error, "test").action).toBe("none");
  });

  it("消えた1件の更新は not_found。画面は一覧へ戻す", async () => {
    setSessionToken(CHILD);
    const list = await fetchPeriods("test", CHILD_ID);
    const error = await failureOf(
      savePeriod("test", {
        childId: CHILD_ID,
        expectedVersion: list.configVersion,
        id: "no-such-id",
        name: "英語",
        startDate: "2026-11-10",
        endDate: "2026-11-11",
      }),
    );
    expect(error.code).toBe("not_found");
    expect(saveFailure(error, "test").action).toBe("back");
  });
});

describe("空白期間（保護者だけ。Q7）", () => {
  // 冬休み（12/24〜1/7）を入れて、そのあとの一覧を返す
  const withWinter = async () => {
    const list = await fetchPeriods("blank", CHILD_ID);
    await savePeriod("blank", {
      childId: CHILD_ID,
      expectedVersion: list.configVersion,
      name: "冬休み",
      startDate: "2026-12-24",
      endDate: "2027-01-07",
    });
    return fetchPeriods("blank", CHILD_ID);
  };

  it("保護者は作成・更新・削除できる", async () => {
    setSessionToken(PARENT);
    const list = await withWinter();
    expect(list.periods.map((p) => p.name)).toContain("冬休み");
    await savePeriod("blank", {
      childId: CHILD_ID,
      expectedVersion: list.configVersion,
      name: "夏休み",
      startDate: "2027-07-20",
      endDate: "2027-08-31",
    });
    const after = await fetchPeriods("blank", CHILD_ID);
    const summer = after.periods.find((p) => p.name === "夏休み");
    if (!summer) throw new Error("夏休みがあるはず");
    await savePeriod("blank", {
      childId: CHILD_ID,
      expectedVersion: after.configVersion,
      id: summer.id,
      name: "夏休み",
      startDate: "2027-07-21",
      endDate: "2027-08-31",
    });
    const updated = await fetchPeriods("blank", CHILD_ID);
    expect(updated.periods.find((p) => p.id === summer.id)?.startDate).toBe("2027-07-21");
    await deletePeriod("blank", { childId: CHILD_ID, expectedVersion: updated.configVersion, id: summer.id });
    expect((await fetchPeriods("blank", CHILD_ID)).periods.some((p) => p.id === summer.id)).toBe(false);
  });

  it("空白期間どうしの重なりは、送る前にもサーバでも断る", async () => {
    setSessionToken(PARENT);
    const list = await withWinter();
    const draft = { name: "年末", startDate: "2026-12-30", endDate: "2027-01-02" };
    expect(validatePeriod(draft, list.periods, "blank").ok).toBe(false);
    const error = await failureOf(
      savePeriod("blank", { childId: CHILD_ID, expectedVersion: list.configVersion, ...draft }),
    );
    expect(error.code).toBe("bad_request");
  });

  it("テスト期間と空白期間は重なってよい（空白期間の日は制限なし）", async () => {
    setSessionToken(PARENT);
    const tests = await fetchPeriods("test", CHILD_ID);
    const blanks = await fetchPeriods("blank", CHILD_ID);
    const math = tests.periods.find((p) => p.name === "数学");
    if (!math) throw new Error("見本の数学があるはず");
    // 数学のテスト期間とまるごと同じ日を空白期間にする
    const draft = { name: "文化祭休み", startDate: math.startDate, endDate: math.endDate };
    expect(validatePeriod(draft, blanks.periods, "blank").ok).toBe(true);
    await expect(
      savePeriod("blank", { childId: CHILD_ID, expectedVersion: blanks.configVersion, ...draft }),
    ).resolves.toMatchObject({ configVersion: blanks.configVersion + 1 });
  });

  it("子どもは空白期間を変えられない（forbidden →「保護者だけが変えられます」）", async () => {
    setSessionToken(CHILD);
    const error = await failureOf(
      savePeriod("blank", {
        childId: CHILD_ID,
        expectedVersion: 0,
        name: "夏休み",
        startDate: "2027-07-20",
        endDate: "2027-08-31",
      }),
    );
    expect(error.code).toBe("forbidden");
    expect(saveFailure(error, "blank").error.message).toBe("空白期間は保護者だけが変えられます");
  });
});

describe("保護者の一覧の反映済み／反映待ち（Q6。一覧が最後に変わった版で決める）", () => {
  // 子どもの端末が設定を取りに来た（C7）ことにする
  const childFetches = async () => {
    setSessionToken(CHILD);
    const { configVersion } = await call("planGet", { childId: CHILD_ID });
    await call("configGet", { childId: CHILD_ID, knownVersion: configVersion });
    setSessionToken(PARENT);
  };
  const statusOf = async (kind: "test" | "blank") => {
    const s = await fetchPeriods(kind, CHILD_ID);
    return appliedStatus(s.changedVersion, s.childAppliedVersion).label;
  };

  it("計画・対象外アプリ・空白期間を保存しただけでは、テストの一覧は反映済みのまま。テストを足すと反映待ち", async () => {
    await childFetches();
    expect(await statusOf("test")).toBe("反映済み");

    // 計画と対象外アプリを保存する（設定の版は上がるが、テストの日程は変わっていない）
    const plan = await call("planGet", { childId: CHILD_ID });
    if (!plan.plan) throw new Error("見本の計画があるはず");
    const saved = await call("planSave", {
      childId: CHILD_ID,
      expectedVersion: plan.configVersion,
      planStartDate: "2026-10-20",
      startLimitMinutes: plan.plan.startLimitMinutes,
      finalGoalMinutes: plan.plan.finalGoalMinutes,
    });
    const excluded = await call("excludedAppsSave", {
      childId: CHILD_ID,
      expectedVersion: saved.configVersion,
      apps: [{ packageName: "com.example.wordcards", label: "英単語カード" }],
    });
    const blank = await savePeriod("blank", {
      childId: CHILD_ID,
      expectedVersion: excluded.configVersion,
      name: "冬休み",
      startDate: "2026-12-24",
      endDate: "2027-01-07",
    });
    const tests = await fetchPeriods("test", CHILD_ID);
    expect(tests.childAppliedVersion).toBeLessThan(tests.configVersion); // 設定の版で決めていた前は「反映待ち」になっていた
    expect(await statusOf("test")).toBe("反映済み");
    expect(await statusOf("blank")).toBe("反映待ち"); // 空白期間は変わったので、こちらは反映待ち

    await savePeriod("test", {
      childId: CHILD_ID,
      expectedVersion: blank.configVersion,
      name: "英語",
      startDate: "2026-11-10",
      endDate: "2026-11-11",
    });
    expect(await statusOf("test")).toBe("反映待ち");

    await childFetches();
    expect([await statusOf("test"), await statusOf("blank")]).toEqual(["反映済み", "反映済み"]);
  });
});
