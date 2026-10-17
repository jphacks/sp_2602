// 親16 制限対象外アプリの管理 の行の中身のテスト（src/components/parent/excluded.ts）。
// 「反映済み／反映待ち」は子どもの端末が使っている版とそのアプリが変わった版の比較（Q6）。スイッチを動かしただけの行は「未保存」。
import { mockExcludedAppCandidates } from "@contracts/fixtures";
import type { ExcludedApp, ExcludedAppsView } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  appsToSave,
  candidateApps,
  excludedListStatus,
  excludedRows,
  hasUnsaved,
  removedApps,
  removedVersions,
  syncExcludedDraft,
} from "@/components/parent/excluded";
import { fresh, newFamily, ok, post } from "../verify/helpers";

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

describe("反映済み／反映待ちをサーバの値だけで決める（親16 を開き直しても正しく出る）", () => {
  it("removedVersions: サーバの removedApps → 外したアプリごとの版", () => {
    expect(
      removedVersions([{ packageName: "com.example.wordcards", label: "英単語カード", removedVersion: 7 }]),
    ).toEqual(new Map([["com.example.wordcards", 7]]));
  });

  it("excludedListStatus: 一覧が最後に変わった版が子どもに届いていれば反映済み。一度も変えていなければ反映済み", () => {
    expect(excludedListStatus({ appsChangedVersion: 6, childAppliedVersion: 5 })).toBe("pending");
    expect(excludedListStatus({ appsChangedVersion: 6, childAppliedVersion: 6 })).toBe("applied");
    expect(excludedListStatus({ appsChangedVersion: 6, childAppliedVersion: null })).toBe("pending");
    expect(excludedListStatus({ appsChangedVersion: 0, childAppliedVersion: null })).toBe("applied");
  });

  it("サーバとつないで: 外したアプリは、画面を開き直しても（取り直しただけでも）子どもが取りに来るまで反映待ち", async () => {
    await fresh("2026-10-15T03:00:00Z");
    const { child, parent } = await newFamily("excluded-reopen");
    const childId = child.userId;
    const get = () => ok<ExcludedAppsView>(post("/api/excluded-apps/get", { childId }, parent.token));
    const rowsOf = (view: ExcludedAppsView) =>
      excludedRows({
        candidates: mockExcludedAppCandidates,
        saved: view.apps,
        draft: new Set(view.apps.map((a) => a.packageName)),
        childAppliedVersion: view.childAppliedVersion,
        removedAt: removedVersions(view.removedApps),
      }).map((r) => [r.label, r.on, r.status]);
    const studynote = { packageName: "com.example.studynote", label: "学習ノート" };
    const wordcards = { packageName: "com.example.wordcards", label: "英単語カード" };

    await ok(
      post("/api/excluded-apps/save", { childId, expectedVersion: 0, apps: [studynote, wordcards] }, parent.token),
    );
    await ok(post("/api/config/get", { childId, knownVersion: 1 }, child.token)); // 子どもが版 1 を受け取った
    await ok(post("/api/excluded-apps/save", { childId, expectedVersion: 1, apps: [studynote] }, parent.token));

    // 開き直した（画面が覚えていたものは何もない）: 英単語カードは外したが、まだ子どもに届いていない
    const reopened = await get();
    expect(rowsOf(reopened)).toEqual([
      ["学習ノート", true, "applied"],
      ["英単語カード", false, "pending"],
      ["動画アプリ", false, "applied"],
      ["ゲーム", false, "applied"],
    ]);
    expect(excludedListStatus(reopened)).toBe("pending");

    // 子どもが版 2 を受け取ったら、すべて反映済み
    await ok(post("/api/config/get", { childId, knownVersion: 2 }, child.token));
    const after = await get();
    expect(rowsOf(after).map((r) => r[2])).toEqual(["applied", "applied", "applied", "applied"]);
    expect(excludedListStatus(after)).toBe("applied");
  });
});

// 実機（10/17 デバッグ）: 親16 を開いたあと、子どもがテストを足す・計画を保存する等で版が上がると、
// スイッチを1つ動かして保存しただけで必ず conflict（「ほかの端末で設定が変わりました」）になっていた
describe("syncExcludedDraft（取り直しのときのスイッチと版）", () => {
  const ids = (s: ReadonlySet<string>) => [...s].sort();

  it("保存していない変更がなければ、サーバの今の一覧と版に合わせ直す", () => {
    const next = syncExcludedDraft(
      { saved, draft: new Set(saved.map((a) => a.packageName)), baseVersion: 6 },
      { apps: saved.slice(0, 1), configVersion: 9 },
    );
    expect(next.baseVersion).toBe(9);
    expect(ids(next.draft)).toEqual(["com.example.studynote"]);
  });

  it("はじめて読み込んだときは、サーバの一覧と版で作る", () => {
    const next = syncExcludedDraft({ saved: null, draft: null, baseVersion: null }, { apps: saved, configVersion: 7 });
    expect(next.baseVersion).toBe(7);
    expect(ids(next.draft)).toEqual(["com.example.studynote", "com.example.wordcards"]);
  });

  it("スイッチを動かしかけなら、動かしかけの状態と、動かし始めたときの版を保つ", () => {
    const draft = new Set(["com.example.studynote"]); // 英単語カードを外しかけ
    const next = syncExcludedDraft({ saved, draft, baseVersion: 6 }, { apps: saved, configVersion: 9 });
    expect(next).toEqual({ draft, baseVersion: 6 });
  });
});
