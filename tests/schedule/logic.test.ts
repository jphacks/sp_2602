// 日程（テスト期間・空白期間）の画面の判断のテスト（src/components/schedule/logic.ts）。
// 入力の検査（空の名前・終了日 < 開始日・重なり）、近い順の並べ方、日付の文言、失敗の出し分け（conflict は読み込み直し）、
// 反映済み／反映待ち（Q6）、一覧の状態（取れない値を 0件と出さない）を確かめる。
import { errorText } from "@contracts/errors";
import { describe, expect, it } from "vitest";
import {
  appliedStatus,
  asTestPeriod,
  deleteConfirmText,
  doneDialog,
  emptyDraft,
  formatDateLong,
  formatDateShort,
  formatPeriodRange,
  type Period,
  type PeriodSource,
  periodPhase,
  periodRowText,
  periodsOnError,
  resolveEditTarget,
  saveFailure,
  sortPeriodsForList,
  validatePeriod,
  withEndDate,
  withStartDate,
} from "@/components/schedule/logic";

const p = (id: string, name: string, startDate: string, endDate: string, extra: Partial<Period> = {}): Period => ({
  id,
  name,
  startDate,
  endDate,
  ...extra,
});
const math = p("t1", "数学", "2026-10-28", "2026-10-30");
const source = (periods: Period[], configVersion = 3): PeriodSource => ({
  periods,
  configVersion,
  childAppliedVersion: 3,
});

describe("日付の文言", () => {
  it("1日は「10月28日（水）」、年つきは「2026年10月28日（水）」（Figma 子03・子10）", () => {
    expect(formatDateShort("2026-10-28")).toBe("10月28日（水）");
    expect(formatDateLong("2026-10-29")).toBe("2026年10月29日（木）");
  });

  it("期間は「10月28日（水）〜10月30日（金）」。開始日と終了日が同じなら1日だけ", () => {
    expect(formatPeriodRange("2026-10-28", "2026-10-30")).toBe("10月28日（水）〜10月30日（金）");
    expect(formatPeriodRange("2026-10-28", "2026-10-28")).toBe("10月28日（水）");
  });

  it("年をまたぐ・今年でない期間は年も付ける", () => {
    expect(formatPeriodRange("2026-12-24", "2027-01-07")).toBe("2026年12月24日（木）〜2027年1月7日（木）");
    expect(formatPeriodRange("2027-03-01", "2027-03-02", "2026-10-17")).toBe("2027年3月1日（月）〜2027年3月2日（火）");
    expect(formatPeriodRange("2026-10-28", "2026-10-30", "2026-10-17")).toBe("10月28日（水）〜10月30日（金）");
  });
});

describe("入力の操作", () => {
  it("開始日を選ぶと、終了日が未入力なら開始日にそろえる", () => {
    expect(withStartDate(emptyDraft, "2026-10-28")).toEqual({
      name: "",
      startDate: "2026-10-28",
      endDate: "2026-10-28",
    });
  });

  it("開始日を終了日より後にしたら、終了日も開始日にそろえる。前なら終了日はそのまま", () => {
    const d = { name: "数学", startDate: "2026-10-28", endDate: "2026-10-30" };
    expect(withStartDate(d, "2026-11-02").endDate).toBe("2026-11-02");
    expect(withStartDate(d, "2026-10-27").endDate).toBe("2026-10-30");
  });

  it("終了日はそのまま入る（逆転は検査で止める）", () => {
    expect(withEndDate({ name: "", startDate: "2026-10-28", endDate: null }, "2026-10-20").endDate).toBe("2026-10-20");
  });
});

describe("入力の検査（送る前に止める。サーバでも断られる）", () => {
  it("正しい入力は、名前の前後の空白を取って通す", () => {
    const r = validatePeriod({ name: "  数学 ", startDate: "2026-10-28", endDate: "2026-10-30" }, [], "test");
    expect(r).toEqual({ ok: true, value: { name: "数学", startDate: "2026-10-28", endDate: "2026-10-30" } });
  });

  it("空の名前（空白だけも）は止める。文言は種類で変える", () => {
    const d = { name: "   ", startDate: "2026-10-28", endDate: "2026-10-28" };
    const test = validatePeriod(d, [], "test");
    const blank = validatePeriod(d, [], "blank");
    expect(test.ok).toBe(false);
    if (!test.ok) expect(test.errors.name).toBe("テスト名を入れてください");
    if (!blank.ok) expect(blank.errors.name).toBe("名前を入れてください");
  });

  it("120文字を超える名前は止める", () => {
    const r = validatePeriod({ name: "あ".repeat(121), startDate: "2026-10-28", endDate: "2026-10-28" }, [], "test");
    expect(r.ok).toBe(false);
  });

  it("日付が未入力なら止める", () => {
    const r = validatePeriod({ name: "数学", startDate: null, endDate: null }, [], "test");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.startDate).toBe("開始日を選んでください");
      expect(r.errors.endDate).toBe("終了日を選んでください");
    }
  });

  it("終了日 < 開始日は止める（同じ日はよい）", () => {
    const bad = validatePeriod({ name: "数学", startDate: "2026-10-30", endDate: "2026-10-28" }, [], "test");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.endDate).toBe("終了日は開始日と同じか、それより後にしてください");
    expect(validatePeriod({ name: "数学", startDate: "2026-10-30", endDate: "2026-10-30" }, [], "test").ok).toBe(true);
  });

  it("同じ種類の期間と1日でも重なれば止め、どれと重なったかを出す（両端の日を含む）", () => {
    const r = validatePeriod({ name: "英語", startDate: "2026-10-30", endDate: "2026-11-02" }, [math], "test");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.endDate).toContain("「数学」（10月28日（水）〜10月30日（金））と重なっています");
      expect(r.errors.startDate).toBeTruthy();
    }
  });

  it("隣り合う日（前の終了日の翌日に始まる）は重なりではない", () => {
    expect(validatePeriod({ name: "英語", startDate: "2026-10-31", endDate: "2026-11-02" }, [math], "test").ok).toBe(
      true,
    );
  });

  it("中に含まれる・外から包む期間も重なりとして止める", () => {
    expect(validatePeriod({ name: "x", startDate: "2026-10-29", endDate: "2026-10-29" }, [math], "test").ok).toBe(
      false,
    );
    expect(validatePeriod({ name: "x", startDate: "2026-10-01", endDate: "2026-11-30" }, [math], "test").ok).toBe(
      false,
    );
  });

  it("変更では自分自身との重なりは見ない", () => {
    const d = { name: "数学", startDate: "2026-10-27", endDate: "2026-10-29" };
    expect(validatePeriod(d, [math], "test", "t1").ok).toBe(true);
  });
});

describe("一覧の並べ方（近い順）", () => {
  const today = "2026-10-29";
  const list = [
    p("a", "期末", "2026-12-01", "2026-12-03"),
    p("b", "中間（終了）", "2026-09-01", "2026-09-02"),
    math, // 10/28〜10/30（期間中）
    p("c", "小テスト", "2026-11-05", "2026-11-05"),
    p("d", "前期（終了）", "2026-10-01", "2026-10-02"),
  ];

  it("期間中・これからを開始日の早い順、終わったものを終わった日の新しい順", () => {
    const r = sortPeriodsForList(list, today);
    expect(r.current.map((x) => x.id)).toEqual(["t1", "c", "a"]);
    expect(r.past.map((x) => x.id)).toEqual(["d", "b"]);
  });

  it("今日が終了日のものはまだ期間中", () => {
    expect(periodPhase(math, "2026-10-30")).toBe("ongoing");
    expect(periodPhase(math, "2026-10-31")).toBe("past");
    expect(periodPhase(math, "2026-10-27")).toBe("upcoming");
  });

  it("元の配列は並べ替えない", () => {
    const copy = [...list];
    sortPeriodsForList(list, today);
    expect(list).toEqual(copy);
  });

  it("行の文言: 期間・期間中／終了・保護者の一覧ではだれが登録したか", () => {
    const row = periodRowText({ ...math, createdByRole: "child" }, today, { showCreator: true });
    expect(row).toMatchObject({
      title: "数学",
      subtitle: "10月28日（水）〜10月30日（金）・お子さんが登録",
      value: "期間中",
    });
    expect(periodRowText(math, "2026-10-01").value).toBeUndefined();
    expect(periodRowText(math, "2026-11-01").value).toBe("終了");
    expect(periodRowText({ ...math, createdByRole: "parent" }, today).subtitle).toBe("10月28日（水）〜10月30日（金）");
  });
});

describe("ダイアログの文言", () => {
  it("子04: 「10月28日（水）の数学を登録しました。」（1日のテストは Figma と同じ文）", () => {
    expect(doneDialog("created", "test", { name: "数学", startDate: "2026-10-28", endDate: "2026-10-28" })).toEqual({
      title: "登録しました。",
      body: "10月28日（水）の数学を登録しました。",
    });
  });

  it("期間・空白期間・変更・削除", () => {
    const v = { name: "夏休み", startDate: "2026-07-20", endDate: "2026-08-31" };
    expect(doneDialog("created", "blank", v).body).toBe("7月20日（月）〜8月31日（月）の「夏休み」を登録しました。");
    expect(doneDialog("updated", "test", math).title).toBe("変更しました。");
    expect(doneDialog("deleted", "test", math).body).toBe("数学（10月28日（水）〜10月30日（金））を削除しました。");
  });

  it("削除の確認は名前と期間と、上限が計算し直されることを出す", () => {
    const t = deleteConfirmText("test", math);
    expect(t.title).toBe("「数学」を削除しますか？");
    expect(t.body).toContain("10月28日（水）〜10月30日（金）のテスト日程を削除します");
    expect(deleteConfirmText("blank", math).body).toContain("の空白期間を削除します");
  });
});

describe("保存の失敗の出し分け", () => {
  it("conflict（版のずれ）は「ほかの端末で変更されました」で読み込み直しへ", () => {
    const f = saveFailure({ code: "conflict", ...errorText.conflict }, "test");
    expect(f.action).toBe("reload");
    expect(f.actionLabel).toBe("読み込み直す");
    expect(f.error.message).toContain("ほかの端末で変更されました");
  });

  it("bad_request はサーバの文をそのまま出し、入力を残す（ボタンなし）", () => {
    const error = {
      code: "bad_request" as const,
      message: "「数学」と期間が重なっています",
      hint: "ほかの期間と重ならない日付にしてください",
    };
    expect(saveFailure(error, "test")).toEqual({ error, action: "none", actionLabel: null });
  });

  it("not_found は一覧へ戻す", () => {
    const f = saveFailure({ code: "not_found", ...errorText.not_found }, "blank");
    expect(f.action).toBe("back");
    expect(f.error.message).toBe("この空白期間は見つかりません");
  });

  it("空白期間の forbidden は「保護者だけ」と出す", () => {
    const f = saveFailure({ code: "forbidden", ...errorText.forbidden }, "blank");
    expect(f.action).toBe("none");
    expect(f.error.message).toBe("空白期間は保護者だけが変えられます");
  });

  it("通信の失敗はもう一度ためせる", () => {
    for (const code of ["network", "timeout", "internal", "upstream_failed", "rate_limited"] as const)
      expect(saveFailure({ code, ...errorText[code] }, "test").action).toBe("retry");
  });
});

describe("反映済み／反映待ち（Q6）", () => {
  it("子どもの端末の版が最新と同じか新しければ反映済み", () => {
    expect(appliedStatus(5, 5).label).toBe("反映済み");
    expect(appliedStatus(5, 5).tone).toBe("success");
  });

  it("古い版・まだ一度も取りに来ていないなら反映待ち", () => {
    expect(appliedStatus(5, 4).label).toBe("反映待ち");
    expect(appliedStatus(5, null)).toMatchObject({
      label: "反映待ち",
      hint: "お子さんの端末がまだ設定を受け取っていません",
    });
  });
});

describe("一覧の状態（取れない値を 0件と出さない）", () => {
  const network = { code: "network" as const, ...errorText.network };

  it("前に取れた一覧があれば、それを古いとして出す", () => {
    const prev = { status: "fresh" as const, data: source([math]) };
    expect(periodsOnError(prev, source([]), network)).toEqual({
      status: "stale",
      data: source([math]),
      error: network,
    });
  });

  it("まだ取れていなければ C7 の組（fallback）を古いとして出す", () => {
    expect(periodsOnError({ status: "loading" }, source([math], 2), network)).toMatchObject({
      status: "stale",
      data: { configVersion: 2 },
    });
  });

  it("何もなければ取得不可（空の一覧にはしない）", () => {
    expect(periodsOnError({ status: "loading" }, null, network)).toEqual({ status: "unavailable", error: network });
  });
});

describe("変更する1件の決め方", () => {
  it("サーバの一覧にあればそれを使う（一覧から渡された値より新しい）", () => {
    const newer = { ...math, name: "数学（改）" };
    expect(resolveEditTarget("t1", math, { status: "fresh", data: source([newer]) })).toEqual({
      status: "found",
      period: newer,
    });
  });

  it("サーバの一覧になければ、ほかの端末で消されたとみなす", () => {
    expect(resolveEditTarget("t1", math, { status: "fresh", data: source([]) })).toEqual({ status: "missing" });
  });

  it("一覧がまだ・古いときは、一覧の画面から渡された値ですぐ出す", () => {
    expect(resolveEditTarget("t1", math, { status: "loading" })).toEqual({ status: "found", period: math });
    expect(resolveEditTarget("t1", math, { status: "stale", data: source([]), error: null })).toEqual({
      status: "found",
      period: math,
    });
  });

  it("渡された値が別の id なら使わない", () => {
    expect(resolveEditTarget("t2", math, { status: "loading" })).toEqual({ status: "loading" });
    expect(resolveEditTarget("t2", math, { status: "unavailable", error: null })).toEqual({
      status: "unavailable",
      error: null,
    });
  });
});

describe("テスト期間として渡せるか", () => {
  it("作った人がついていれば TestPeriod、なければ（空白期間）null", () => {
    expect(asTestPeriod({ ...math, createdByUserId: "u1", createdByRole: "child" })).toMatchObject({
      id: "t1",
      createdByRole: "child",
    });
    expect(asTestPeriod(math)).toBeNull();
  });
});
