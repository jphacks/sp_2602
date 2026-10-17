// 制限する Web サイト（D-111）の登録のそろえ方と一致の規則（contracts/web-sites.ts）のテスト。
// 例の表は Kotlin のテスト（WebSitesTest）と同じファイルを読む（両方で同じ規則になっているかを確かめるため）:
//   modules/kit-native/android/src/test/resources/web-site-cases.tsv
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  firstMatchingSite,
  isNormalizedSitePattern,
  MAX_SITE_PATTERN_LENGTH,
  normalizeSitePattern,
  siteMatches,
} from "@contracts/web-sites";
import { describe, expect, it } from "vitest";

const table = readFileSync(
  fileURLToPath(new URL("../../modules/kit-native/android/src/test/resources/web-site-cases.tsv", import.meta.url)),
  "utf8",
);
const rows = table
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "" && !line.startsWith("#"))
  .map((line) => line.split("\t"));
const normalizeCases = rows.filter((r) => r[0] === "normalize").map((r) => ({ input: r[1] ?? "", want: r[2] ?? "" }));
const matchCases = rows
  .filter((r) => r[0] === "match")
  .map((r) => ({ address: r[1] ?? "", pattern: r[2] ?? "", want: r[3] === "true" }));

describe("例の表（Kotlin と同じ表）", () => {
  it("表を読めている（行の数が少なすぎない・形が正しい）", () => {
    expect(normalizeCases.length).toBeGreaterThan(15);
    expect(matchCases.length).toBeGreaterThan(25);
    for (const r of rows) expect(["normalize", "match"]).toContain(r[0]);
  });

  it.each(normalizeCases)("そろえ方: 「$input」→ $want", ({ input, want }) => {
    const r = normalizeSitePattern(input);
    if (want === "ERR") expect(r.ok).toBe(false);
    else expect(r).toEqual({ ok: true, pattern: want });
  });

  it.each(matchCases)("一致: 「$address」と「$pattern」→ $want", ({ address, pattern, want }) => {
    expect(siteMatches(address, pattern)).toBe(want);
  });

  it("表の登録はどれもそろえた形（表そのものの書き間違いを見つける）", () => {
    for (const c of matchCases) expect(isNormalizedSitePattern(c.pattern), c.pattern).toBe(true);
  });
});

describe("normalizeSitePattern（保護者の入力）", () => {
  it("断るときは、保護者に分かる文を返す", () => {
    expect(normalizeSitePattern("")).toEqual({ ok: false, message: "サイトのアドレスを入れてください" });
    expect(normalizeSitePattern("   ")).toEqual({ ok: false, message: "サイトのアドレスを入れてください" });
    const r = normalizeSitePattern("youtube");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("youtube.com");
    const q = normalizeSitePattern("youtube.com/watch?v=abc");
    if (!q.ok) expect(q.message).toContain("?");
  });

  it("前後の空白（タブ・改行も）を外す", () => {
    expect(normalizeSitePattern(" \tyoutube.com/ \n")).toEqual({ ok: true, pattern: "youtube.com" });
  });

  it(`長さは ${MAX_SITE_PATTERN_LENGTH} 文字まで`, () => {
    const host = "example.com/";
    const ok = host + "a".repeat(MAX_SITE_PATTERN_LENGTH - host.length);
    expect(normalizeSitePattern(ok)).toEqual({ ok: true, pattern: ok });
    expect(normalizeSitePattern(`${ok}b`).ok).toBe(false);
  });

  it("そろえた形をもう一度そろえても変わらない", () => {
    for (const c of normalizeCases) {
      const r = normalizeSitePattern(c.input);
      if (r.ok) expect(normalizeSitePattern(r.pattern)).toEqual(r);
    }
  });
});

describe("firstMatchingSite", () => {
  it("当たった最初の登録を返す。どれにも当たらなければ null", () => {
    const sites = ["youtube.com/shorts", "tiktok.com"];
    expect(firstMatchingSite("https://m.youtube.com/shorts/abc", sites)).toBe("youtube.com/shorts");
    expect(firstMatchingSite("www.tiktok.com/@user", sites)).toBe("tiktok.com");
    expect(firstMatchingSite("youtube.com/watch?v=1", sites)).toBeNull();
    expect(firstMatchingSite("youtube.com", [])).toBeNull();
  });
});
