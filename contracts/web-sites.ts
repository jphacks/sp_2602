// 制限する Web サイト（D-111）の「登録の形の整え方」と「URL がその登録に当たるか」の規則。純粋な関数だけ。
// 同じ規則を Kotlin（modules/kit-native/.../engine/WebSites.kt）にも書いてあり、どちらも同じ例の表
// （modules/kit-native/android/src/test/resources/web-site-cases.tsv）で確かめる（TS: tests/lib/web-sites.test.ts、Kotlin: WebSitesTest）。
// 片方を変えたら、もう片方と表も直す。
//
// 登録の形は2通り:
//   "youtube.com"        … そのドメインとサブドメイン全体（www.youtube.com・m.youtube.com も）
//   "youtube.com/shorts" … ドメインが合い、かつパスがその前置きで始まるときだけ（/shorts・/shorts/abc は当たる、/watch・/shortsxyz は当たらない）
// 保護者がふつうに打つ形（https://・www.・大文字・末尾の /・前後の空白・全角の英数字）を受け付けて、上の形にそろえる。
// 似た名前の別ドメイン（youtube.com.evil.example・notyoutube.com）は当たらない（ドメインは「同じ」か「.＋登録」で終わるときだけ）。

// 1人の子どもに登録できる数と、1つの長さの上限（契約 contracts/schemas.ts の BlockedSitesSave もこれを使う）
export const MAX_BLOCKED_SITES = 100;
export const MAX_SITE_PATTERN_LENGTH = 200;

export type SitePatternResult = { ok: true; pattern: string } | { ok: false; message: string };

// ドメインの1つの区切り（英小文字・数字・ハイフン。先頭と末尾はハイフンにしない。63 文字まで）
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// 最後の区切り（.com・.jp など）。英字だけ2文字以上（数字だけ = IP アドレスは受け付けない）。xn-- は国別の日本語ドメインなど
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
// パスに使ってよい文字（URL でそのまま書ける文字。? と # は別に断る）
const PATH = /^[a-z0-9\-._~!$&'()*+,;=:@%/]*$/;

const fail = (message: string): SitePatternResult => ({ ok: false, message });

// 保護者が打った文字 → 登録の形。なぜ保存の前にそろえるか: 同じサイトが別の書き方で2つ入らないように・
// 子どもの端末（Kotlin）が毎回そろえ直さなくても比べられるように
export function normalizeSitePattern(input: string): SitePatternResult {
  // 全角の英数字・記号を半角に（「ｙｏｕｔｕｂｅ．ｃｏｍ」）、大文字を小文字に。前後の空白を外す
  let s = input.normalize("NFKC").trim().toLowerCase();
  if (!s) return fail("サイトのアドレスを入れてください");
  if (/\s/.test(s)) return fail("アドレスに空白は入れられません");
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(s);
  if (scheme) {
    if (scheme[1] !== "http" && scheme[1] !== "https") return fail("http または https のアドレスを入れてください");
    s = s.slice(scheme[0].length);
  }
  if (s.includes("?") || s.includes("#")) {
    return fail("「?」「#」より後ろは登録できません。youtube.com/shorts のように途中までで入れてください");
  }
  const slash = s.indexOf("/");
  let host = slash < 0 ? s : s.slice(0, slash);
  let path = slash < 0 ? "" : s.slice(slash);
  if (host.includes("@")) return fail("ドメイン（例: youtube.com）から入れてください");
  if (host.includes(":")) return fail("「:」（ポート番号など）は入れられません");
  host = host.replace(/\.+$/, ""); // 末尾の「.」（example.com.）
  if (host.startsWith("www.")) host = host.slice(4);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 英数字以外（日本語など）が入っているかを見る
  if (/[^\x00-\x7f]/.test(host)) return fail("日本語のドメインはまだ登録できません。英字のアドレスで入れてください");
  const labels = host.split(".");
  if (labels.length < 2 || host.length > 253 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels.at(-1) ?? "")) {
    return fail("ドメインの形ではありません（例: youtube.com）");
  }
  path = path.replace(/\/+$/, ""); // 末尾の「/」
  if (!PATH.test(path)) return fail("アドレスに使えない文字が入っています");
  const pattern = host + path;
  if (pattern.length > MAX_SITE_PATTERN_LENGTH)
    return fail(`アドレスが長すぎます（${MAX_SITE_PATTERN_LENGTH} 文字まで）`);
  return { ok: true, pattern };
}

// 登録の形にそろっているか（サーバの入口で確かめる。そろえ直すと同じになる = すでにそろっている）
export function isNormalizedSitePattern(pattern: string): boolean {
  const r = normalizeSitePattern(pattern);
  return r.ok && r.pattern === pattern;
}

// ブラウザのアドレス欄の文字（"https://m.youtube.com/shorts/abc"・"youtube.com/shorts/abc"・"youtube.com"）→ ドメインとパス。
// アドレスらしくない（空白が入る = 検索の言葉・ドメインの形でない・http(s) 以外）なら null（判定しない）
export function parseAddress(text: string): { host: string; path: string } | null {
  let s = text.trim().toLowerCase();
  if (!s || /\s/.test(s)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(s);
  if (scheme) {
    if (scheme[1] !== "http" && scheme[1] !== "https") return null;
    s = s.slice(scheme[0].length);
  }
  const end = s.search(/[/?#]/);
  let host = end < 0 ? s : s.slice(0, end);
  const rest = end < 0 ? "" : s.slice(end);
  const at = host.lastIndexOf("@"); // user@host の形（"youtube.com@evil.example" の本当の行き先は evil.example）
  if (at >= 0) host = host.slice(at + 1);
  host = host.replace(/:\d*$/, "").replace(/\.+$/, ""); // ポート番号・末尾の「.」
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !TLD.test(labels.at(-1) ?? "")) return null;
  const q = rest.search(/[?#]/);
  const path = q < 0 ? rest : rest.slice(0, q);
  return { host, path: path || "/" };
}

// アドレス欄の文字が、登録の1つに当たるか（pattern は normalizeSitePattern でそろえた形）
export function siteMatches(address: string, pattern: string): boolean {
  const a = parseAddress(address);
  if (!a) return false;
  const slash = pattern.indexOf("/");
  const host = slash < 0 ? pattern : pattern.slice(0, slash);
  const prefix = slash < 0 ? "" : pattern.slice(slash);
  if (a.host !== host && !a.host.endsWith(`.${host}`)) return false;
  if (!prefix) return true;
  // パスの区切りで比べる（"/shorts" は "/shorts"・"/shorts/abc" に当たり、"/shortstory" には当たらない）
  return a.path === prefix || a.path.startsWith(`${prefix}/`);
}

// 当たった最初の登録（なければ null）
export function firstMatchingSite(address: string, patterns: readonly string[]): string | null {
  return patterns.find((p) => siteMatches(address, p)) ?? null;
}
