// 親16 制限対象外アプリの管理 の行の中身のテスト（src/components/parent/excluded.ts）。
// 「反映済み／反映待ち」は子どもの端末が使っている版とそのアプリが変わった版の比較（Q6）。スイッチを動かしただけの行は「未保存」。
import { mockExcludedAppCandidates } from "@contracts/fixtures";
import type { ExcludedApp } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { appsToSave, candidateApps, excludedRows, hasUnsaved, removedApps } from "@/components/parent/excluded";

const saved: ExcludedApp[] = [
  { packageName: "com.example.studynote", label: "学習ノート", sinceVersion: 3 },
  { packageName: "com.example.wordcards", label: "英単語カード", sinceVersion: 6 },
];
const on = (...p: string[]) => new Set(p);

describe("excludedRows", () => {
  it("Figma 親16: 学習ノート ON 反映済み・英単語カード ON 反映待ち・動画アプリ OFF 反映済み・ゲーム OFF 反映済み", () => {
    const rows = excludedRows({
      candidates: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.wordcards"),
      childAppliedVersion: 5,
      removedAt: new Map(),
    });
    expect(rows.map((r) => [r.initial, r.label, r.on, r.status])).toEqual([
      ["学", "学習ノート", true, "applied"],
      ["英", "英単語カード", true, "pending"],
      ["動", "動画アプリ", false, "applied"],
      ["ゲ", "ゲーム", false, "applied"],
    ]);
  });

  it("子どもの端末がまだ一度も取りに来ていなければ、ON のアプリは反映待ち", () => {
    const rows = excludedRows({
      candidates: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.wordcards"),
      childAppliedVersion: null,
      removedAt: new Map(),
    });
    expect(rows.slice(0, 2).map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  it("この画面で外して保存したアプリは、その版が届くまで反映待ち", () => {
    const input = {
      candidates: mockExcludedAppCandidates,
      saved: saved.slice(0, 1),
      draft: on("com.example.studynote"),
      removedAt: new Map([["com.example.wordcards", 7]]),
    };
    expect(excludedRows({ ...input, childAppliedVersion: 6 })[1]?.status).toBe("pending");
    expect(excludedRows({ ...input, childAppliedVersion: 7 })[1]?.status).toBe("applied");
  });

  it("スイッチを動かしてまだ保存していない行は未保存", () => {
    const rows = excludedRows({
      candidates: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.game"), // 英単語カードを OFF、ゲームを ON
      childAppliedVersion: 9,
      removedAt: new Map(),
    });
    expect(rows.map((r) => r.status)).toEqual(["applied", "unsaved", "applied", "unsaved"]);
  });

  it("候補にない保存済みのアプリも消さずに後ろに並べる（TODO(保留): Q15 の候補は MOCK）", () => {
    const extra: ExcludedApp = { packageName: "jp.example.dict", label: "辞書", sinceVersion: 1 };
    expect(candidateApps(mockExcludedAppCandidates, [...saved, extra]).map((c) => c.label)).toEqual([
      "学習ノート",
      "英単語カード",
      "動画アプリ",
      "ゲーム",
      "辞書",
    ]);
  });
});

describe("保存する中身", () => {
  it("appsToSave は ON のアプリの全件（差分ではない）", () => {
    expect(appsToSave(mockExcludedAppCandidates, saved, on("com.example.video", "com.example.studynote"))).toEqual([
      { packageName: "com.example.studynote", label: "学習ノート" },
      { packageName: "com.example.video", label: "動画アプリ" },
    ]);
    expect(appsToSave(mockExcludedAppCandidates, saved, on())).toEqual([]);
  });

  it("removedApps は保存で外れたアプリ", () => {
    expect(removedApps(saved, [{ packageName: "com.example.studynote", label: "学習ノート" }])).toEqual([
      "com.example.wordcards",
    ]);
  });

  it("hasUnsaved は保存済みと画面のスイッチが違うとき true", () => {
    expect(hasUnsaved(saved, on("com.example.studynote", "com.example.wordcards"))).toBe(false);
    expect(hasUnsaved(saved, on("com.example.studynote"))).toBe(true);
    expect(hasUnsaved(saved, on("com.example.studynote", "com.example.game"))).toBe(true);
  });
});
