// 制限する Web サイト（parent/blocked-sites.tsx。D-111）の行に出す「同じサービスのアプリが制限対象外になっています」の注意の決め方
// （純粋な関数。tests/parent/site-apps.test.ts）。
// なぜ（2026-10-18 実機）: Web サイトの登録はブラウザの中でしか止まらず、YouTube などのアプリは止まらない。登録したサイトの
//   アプリを親16 で「制限対象外」にしていると、アプリでは時間が終わっても見放題なのに、この画面からは気づけなかった。
// 対応は、よく使うサービスだけの小さな表（全部のサイトは分からないので、表にないサイトには何も出さない）。
// 登録（pattern）は normalizeSitePattern でそろえた形（小文字・www. なし・「ドメイン」か「ドメイン/パス」）。
//   ドメインが表のドメインと同じか、そのサブドメイン（m.youtube.com など）なら当たる。パスは見ない（youtube.com/shorts も
//   YouTube のアプリで見られるため）。似た名前の別ドメイン（notyoutube.com）は当たらない。

export type SiteService = {
  name: string; // 画面に出す名前
  domains: readonly string[];
  packages: readonly string[]; // Android のアプリの packageName（同じサービスの別のアプリ・地域ごとのアプリもふくむ）
};

export const SITE_SERVICES: readonly SiteService[] = [
  { name: "YouTube", domains: ["youtube.com", "youtu.be"], packages: ["com.google.android.youtube"] },
  {
    name: "TikTok",
    domains: ["tiktok.com"],
    packages: ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go"],
  },
  { name: "Instagram", domains: ["instagram.com"], packages: ["com.instagram.android"] },
  { name: "X", domains: ["x.com", "twitter.com"], packages: ["com.twitter.android"] },
  { name: "Threads", domains: ["threads.net", "threads.com"], packages: ["com.instagram.barcelona"] },
  { name: "Facebook", domains: ["facebook.com"], packages: ["com.facebook.katana", "com.facebook.lite"] },
  { name: "Netflix", domains: ["netflix.com"], packages: ["com.netflix.mediaclient"] },
  { name: "Twitch", domains: ["twitch.tv"], packages: ["tv.twitch.android.app"] },
  { name: "ニコニコ動画", domains: ["nicovideo.jp"], packages: ["jp.nicovideo.android"] },
  { name: "ABEMA", domains: ["abema.tv"], packages: ["tv.abema"] },
  { name: "Reddit", domains: ["reddit.com"], packages: ["com.reddit.frontpage"] },
  { name: "Discord", domains: ["discord.com"], packages: ["com.discord"] },
  { name: "Roblox", domains: ["roblox.com"], packages: ["com.roblox.client"] },
];

// 登録の形からドメインだけ（「youtube.com/shorts」→「youtube.com」）
function hostOf(pattern: string): string {
  const slash = pattern.indexOf("/");
  return (slash < 0 ? pattern : pattern.slice(0, slash)).toLowerCase();
}

// 登録に当たるサービス（表になければ null）
export function serviceForSite(pattern: string): SiteService | null {
  const host = hostOf(pattern);
  return SITE_SERVICES.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}

// 登録したサイトのアプリが制限対象外（excluded に packageName がある）なら、その行に出す注意の文。なければ null
export function excludedAppWarning(pattern: string, excluded: ReadonlySet<string>): string | null {
  const service = serviceForSite(pattern);
  if (!service?.packages.some((p) => excluded.has(p))) return null;
  return `${service.name} のアプリは制限対象外になっています（アプリでは見られます）`;
}
