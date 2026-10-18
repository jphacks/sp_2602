// 制限する Web サイトの画面（parent/blocked-sites.tsx。D-111）の中身の決め方（src/components/parent/blocked-sites.ts）のテスト。
// 確かめること: 入力をそろえてから下書きに入れる・断るときの文・行ごとの「反映済み／反映待ち／まだ保存していません／外します」・
// 一覧の全体の札・保存していない変更があるか・30 秒ごとの取り直しで下書きと版をどうするか（親16 と同じ決まり）。
import type { BlockedSite } from "@contracts/schemas";
import { MAX_BLOCKED_SITES } from "@contracts/web-sites";
import { describe, expect, it } from "vitest";
import {
  addSite,
  hasUnsavedSites,
  removeSite,
  restoreSite,
  siteRows,
  siteScope,
  sitesListStatus,
  syncSitesDraft,
} from "@/components/parent/blocked-sites";

const saved: BlockedSite[] = [
  { pattern: "youtube.com/shorts", sinceVersion: 2 },
  { pattern: "tiktok.com", sinceVersion: 4 },
];

describe("addSite（入力を下書きに入れる）", () => {
  it("保護者がふつうに打つ形をそろえてから入れる", () => {
    expect(addSite([], "https://www.YouTube.com/shorts/")).toEqual({
      ok: true,
      draft: ["youtube.com/shorts"],
      pattern: "youtube.com/shorts",
    });
  });

  it("ドメインらしくないもの・もう入っているもの・数の上限は、分かる文で断る", () => {
    const bad = addSite([], "youtube");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain("例: youtube.com");
    expect(addSite(["youtube.com"], "WWW.youtube.com/")).toEqual({
      ok: false,
      message: "youtube.com はもう入っています",
    });
    const full = Array.from({ length: MAX_BLOCKED_SITES }, (_, i) => `s${i}.example.com`);
    const over = addSite(full, "youtube.com");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain(`${MAX_BLOCKED_SITES} 件まで`);
  });

  it("外す・戻す（戻すと後ろに足す。もう入っていれば何もしない）", () => {
    expect(removeSite(["a.com", "b.com"], "a.com")).toEqual(["b.com"]);
    expect(restoreSite(["b.com"], "a.com")).toEqual(["b.com", "a.com"]);
    expect(restoreSite(["a.com"], "a.com")).toEqual(["a.com"]);
  });
});

describe("siteRows（行ごとの状態）", () => {
  it("保存済みは sinceVersion と子どもの版で反映済み／反映待ち、足しただけは「まだ保存していません」、外しかけは「外します」で後ろに残す", () => {
    const rows = siteRows({ saved, draft: ["youtube.com/shorts", "example.com"], childAppliedVersion: 3 });
    expect(rows.map((r) => [r.pattern, r.status])).toEqual([
      ["youtube.com/shorts", "applied"],
      ["example.com", "unsaved"],
      ["tiktok.com", "removing"],
    ]);
    const pending = siteRows({ saved, draft: ["youtube.com/shorts", "tiktok.com"], childAppliedVersion: 3 });
    expect(pending.map((r) => r.status)).toEqual(["applied", "pending"]);
    // 子どもの端末がまだ一度も取りに来ていない（null）は反映待ち
    expect(siteRows({ saved, draft: ["tiktok.com"], childAppliedVersion: null })[0]?.status).toBe("pending");
  });

  it("何を止める登録かの説明（サイト全体か、パスから始まるページだけか）", () => {
    expect(siteScope("youtube.com")).toBe("サイト全体（サブドメインもふくむ）");
    expect(siteScope("youtube.com/shorts")).toBe("/shorts から始まるページだけ");
  });
});

describe("sitesListStatus（見出しの横の札）", () => {
  it("一度も変えていなければ反映済み。変えた版が子どもの版以下なら反映済み、より新しければ反映待ち", () => {
    expect(sitesListStatus({ sitesChangedVersion: 0, childAppliedVersion: null })).toBe("applied");
    expect(sitesListStatus({ sitesChangedVersion: 4, childAppliedVersion: 4 })).toBe("applied");
    expect(sitesListStatus({ sitesChangedVersion: 5, childAppliedVersion: 4 })).toBe("pending");
    expect(sitesListStatus({ sitesChangedVersion: 5, childAppliedVersion: null })).toBe("pending");
  });
});

describe("hasUnsavedSites・syncSitesDraft", () => {
  it("順番だけの違いは変更にしない", () => {
    expect(hasUnsavedSites(saved, ["tiktok.com", "youtube.com/shorts"])).toBe(false);
    expect(hasUnsavedSites(saved, ["tiktok.com"])).toBe(true);
    expect(hasUnsavedSites(saved, ["tiktok.com", "example.com"])).toBe(true);
  });

  it("保存していない変更がなければ、サーバの今の一覧と版に合わせ直す（版が上がっても最初の保存が conflict にならない）", () => {
    const view = { sites: [...saved, { pattern: "example.com", sinceVersion: 6 }], configVersion: 7 };
    expect(syncSitesDraft({ saved, draft: ["youtube.com/shorts", "tiktok.com"], baseVersion: 5 }, view)).toEqual({
      draft: ["youtube.com/shorts", "tiktok.com", "example.com"],
      baseVersion: 7,
    });
    // 初めて読んだとき
    expect(syncSitesDraft({ saved: null, draft: null, baseVersion: null }, view).baseVersion).toBe(7);
  });

  it("保存していない変更があれば、下書きと触り始めたときの版を保つ（ほかの端末が先に変えたら conflict で気づける）", () => {
    const current = { saved, draft: ["youtube.com/shorts"], baseVersion: 5 };
    expect(syncSitesDraft(current, { sites: saved, configVersion: 7 })).toEqual({
      draft: ["youtube.com/shorts"],
      baseVersion: 5,
    });
  });
});
