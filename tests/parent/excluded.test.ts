// 親16 制限対象外アプリの管理 の行の中身のテスト（src/components/parent/excluded.ts）。
// 「反映済み／反映待ち」は子どもの端末が使っている版とそのアプリが変わった版の比較（Q6）。スイッチを動かしただけの行は「未保存」。
// 候補（Q15・D-110）は子どもの端末から届いたアプリ一覧（ここでは見本の4つ）を表示名の順に並べ、一覧にない保存済みのアプリを後ろに足す。
import { mockExcludedAppCandidates } from "@contracts/fixtures";
import type { ExcludedApp, ExcludedAppsView } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  appsToSave,
  candidateApps,
  excludedListStatus,
  excludedRows,
  filterRows,
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
  it("Figma 親16: 学習ノート ON 反映済み・英単語カード ON 反映待ち・動画アプリ OFF 反映済み・ゲーム OFF 反映済み（表示名の順）", () => {
    const rows = excludedRows({
      childApps: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.wordcards"),
      childAppliedVersion: 5,
      removedAt: new Map(),
    });
    // 表示名の順（Intl.Collator("ja")。かな → 漢字）
    expect(rows.map((r) => [r.initial, r.label, r.on, r.status, r.missing])).toEqual([
      ["ゲ", "ゲーム", false, "applied", false],
      ["英", "英単語カード", true, "pending", false],
      ["学", "学習ノート", true, "applied", false],
      ["動", "動画アプリ", false, "applied", false],
    ]);
  });

  it("子どもの端末がまだ一度も取りに来ていなければ、ON のアプリは反映待ち", () => {
    const rows = excludedRows({
      childApps: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.wordcards"),
      childAppliedVersion: null,
      removedAt: new Map(),
    });
    expect(rows.filter((r) => r.on).map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  it("この画面で外して保存したアプリは、その版が届くまで反映待ち", () => {
    const input = {
      childApps: mockExcludedAppCandidates,
      saved: saved.slice(0, 1),
      draft: on("com.example.studynote"),
      removedAt: new Map([["com.example.wordcards", 7]]),
    };
    expect(excludedRows({ ...input, childAppliedVersion: 6 })[1]?.status).toBe("pending");
    expect(excludedRows({ ...input, childAppliedVersion: 7 })[1]?.status).toBe("applied");
  });

  it("スイッチを動かしてまだ保存していない行は未保存", () => {
    const rows = excludedRows({
      childApps: mockExcludedAppCandidates,
      saved,
      draft: on("com.example.studynote", "com.example.game"), // 英単語カードを OFF、ゲームを ON
      childAppliedVersion: 9,
      removedAt: new Map(),
    });
    // ゲーム（ON にした）・英単語カード（OFF にした）・学習ノート・動画アプリ
    expect(rows.map((r) => r.status)).toEqual(["unsaved", "unsaved", "applied", "applied"]);
  });

  it("子どもの端末の一覧にない保存済みのアプリ（消されたアプリなど）も消さずに後ろに並べ、「見つかりません」の印を付ける", () => {
    const extra: ExcludedApp = { packageName: "jp.example.dict", label: "辞書", sinceVersion: 1 };
    expect(candidateApps(mockExcludedAppCandidates, [...saved, extra]).map((c) => [c.label, c.missing])).toEqual([
      ["ゲーム", false],
      ["英単語カード", false],
      ["学習ノート", false],
      ["動画アプリ", false],
      ["辞書", true],
    ]);
  });

  it("一覧がまだ届いていない（null）ときは、見本で埋めず保存済みのアプリだけ（「見つかりません」の印は付けない）", () => {
    const rows = excludedRows({
      childApps: null,
      saved,
      draft: on("com.example.studynote", "com.example.wordcards"),
      childAppliedVersion: 9,
      removedAt: new Map(),
    });
    expect(rows.map((r) => [r.label, r.on, r.missing])).toEqual([
      ["英単語カード", true, false],
      ["学習ノート", true, false],
    ]);
  });

  it("同じアプリが一覧と保存済みの両方にあれば1行だけで、子どもの端末の今の名前を出す", () => {
    const list = [{ packageName: "com.example.studynote", label: "学習ノート２" }];
    expect(candidateApps(list, saved).map((c) => [c.packageName, c.label, c.missing])).toEqual([
      ["com.example.studynote", "学習ノート２", false],
      ["com.example.wordcards", "英単語カード", true],
    ]);
  });
});

describe("filterRows（名前で絞り込む）", () => {
  const rows = [
    { packageName: "com.example.game", label: "ゲーム" },
    { packageName: "com.google.android.youtube", label: "YouTube" },
    { packageName: "com.example.studynote", label: "学習ノート" },
  ];
  it("空なら全部。名前の一部で絞る（大文字・小文字、全角・半角、ひらがな・カタカナの違いは無視する）", () => {
    expect(filterRows(rows, "  ")).toHaveLength(3);
    expect(filterRows(rows, "youtube").map((r) => r.label)).toEqual(["YouTube"]);
    expect(filterRows(rows, "ＹＯＵ").map((r) => r.label)).toEqual(["YouTube"]);
    expect(filterRows(rows, "げーむ").map((r) => r.label)).toEqual(["ゲーム"]);
    expect(filterRows(rows, "ノート").map((r) => r.label)).toEqual(["学習ノート"]);
    expect(filterRows(rows, "なし")).toEqual([]);
  });
  it("packageName でも見つかる", () => {
    expect(filterRows(rows, "studynote").map((r) => r.label)).toEqual(["学習ノート"]);
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
        childApps: mockExcludedAppCandidates,
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
      ["ゲーム", false, "applied"],
      ["英単語カード", false, "pending"],
      ["学習ノート", true, "applied"],
      ["動画アプリ", false, "applied"],
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
