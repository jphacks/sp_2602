// 制限する Web サイトの行に出す「アプリが制限対象外になっています」の注意（src/components/parent/site-apps.ts）のテスト。
// 確かめること: 表のドメインとサブドメインには当たり、似た名前の別ドメインには当たらない・パスは見ない・
// 同じサービスのアプリのどれかが対象外なら注意を出し、そうでなければ出さない・表そのものの書き間違い。
import { normalizeSitePattern } from "@contracts/web-sites";
import { describe, expect, it } from "vitest";
import { excludedAppWarning, SITE_SERVICES, serviceForSite } from "@/components/parent/site-apps";

describe("serviceForSite", () => {
  it("表のドメイン・サブドメイン・パスつきの登録は、そのサービスに当たる", () => {
    expect(serviceForSite("youtube.com")?.name).toBe("YouTube");
    expect(serviceForSite("m.youtube.com")?.name).toBe("YouTube");
    expect(serviceForSite("youtube.com/shorts")?.name).toBe("YouTube");
    expect(serviceForSite("youtu.be")?.name).toBe("YouTube");
    expect(serviceForSite("tiktok.com")?.name).toBe("TikTok");
    expect(serviceForSite("instagram.com")?.name).toBe("Instagram");
    expect(serviceForSite("x.com")?.name).toBe("X");
    expect(serviceForSite("twitter.com")?.name).toBe("X");
  });

  it("似た名前の別ドメイン・表にないサイトは当たらない", () => {
    expect(serviceForSite("notyoutube.com")).toBeNull();
    expect(serviceForSite("youtube.com.evil.example")).toBeNull();
    expect(serviceForSite("box.com")).toBeNull(); // x.com で終わるが別のドメイン
    expect(serviceForSite("example.com")).toBeNull();
  });
});

describe("excludedAppWarning", () => {
  it("登録したサイトのアプリが対象外なら、その行に注意を出す（パスつきの登録でも）", () => {
    const excluded = new Set(["com.google.android.youtube"]);
    expect(excludedAppWarning("youtube.com/shorts", excluded)).toBe(
      "YouTube のアプリは制限対象外になっています（アプリでは見られます）",
    );
  });

  it("同じサービスの別のアプリ（地域ごとの TikTok など）のどれかが対象外でも出す", () => {
    expect(excludedAppWarning("tiktok.com", new Set(["com.ss.android.ugc.trill"]))).toBe(
      "TikTok のアプリは制限対象外になっています（アプリでは見られます）",
    );
    expect(excludedAppWarning("twitter.com", new Set(["com.twitter.android"]))).toContain("X のアプリ");
  });

  it("アプリが対象外でない・表にないサイトなら出さない", () => {
    expect(excludedAppWarning("youtube.com", new Set(["com.instagram.android"]))).toBeNull();
    expect(excludedAppWarning("youtube.com", new Set())).toBeNull();
    expect(excludedAppWarning("example.com", new Set(["com.google.android.youtube"]))).toBeNull();
  });
});

describe("SITE_SERVICES（表そのものの書き間違いを見つける）", () => {
  it("どのドメインも登録のそろえ方でそろえた形で、2つのサービスに重ならない。アプリが1つ以上ある", () => {
    const seen = new Set<string>();
    for (const s of SITE_SERVICES) {
      expect(s.packages.length).toBeGreaterThan(0);
      for (const d of s.domains) {
        expect(normalizeSitePattern(d)).toEqual({ ok: true, pattern: d });
        expect(seen.has(d)).toBe(false);
        seen.add(d);
      }
    }
  });
});
