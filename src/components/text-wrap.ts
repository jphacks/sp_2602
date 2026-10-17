// 日本語の文が、言葉の途中や「1〜2文字だけ」で次の行に落ちないようにする（AppText が文字列に使う。React Native を読まない純粋な関数）。
// なぜ: Android は日本語をどの文字の間でも折り返すので、幅や文字の大きさによって「くだ／さい」「変／更」「…ため／に、」「か／ら入れられます」
//   のように切れる。これまでは1台の端末（Figma の幅）に合わせて文の途中に手で改行（\n）を入れていたが、幅や文字の大きさが違う端末では
//   かえって変な所で切れる。手の改行はやめ、どの端末でも「言葉（文節）の切れ目でだけ折り返す」ことを決める。
//   はじめは各行の終わりの言葉だけをまとめていたが、実機（A53・文字 1.15 倍）で「…出すため／に、」「「日程登録」か／ら…」のように
//   行の途中の切れ方は直らなかった（第2回のデバッグ）。そこで、行の途中も文節ごとにまとめる。
// やり方: 文字の間に、目に見えない「ここでは改行しない」印（U+2060 WORD JOINER）を入れる。折り返しが要らない幅なら見た目は何も変わらない。
//   - 切ってよい所（文節の切れ目）: 句読点・かっこの閉じ・空白の後、かぎかっこの開きの前、助詞（の・を・に…）の後（ただし次がひらがななら
//     「ときに」「できる」「ながら」のような言葉の中のことが多いので切らない）
//   - 切れ目と切れ目の間（文節）は、短ければ（LONG_UNIT 文字まで）まとめる。長すぎる文節は、まとめると行の右が大きく空くのでまとめない
//   - 行の終わりの言葉（最後の区切りの後の 2〜6 文字。見つからなければ最後の4文字）は、文節の長さによらずまとめる（1〜2文字だけ落とさない）
//   - 1行に入りきらないほど長いまとまりは、Android が仕方なく途中で切るので、文字が画面の外へはみ出すことはない
const WORD_JOINER = String.fromCharCode(0x2060); // 目に見えない文字なので、ソースには番号で書く
// この文字の後ろなら、いつでも折り返してよい（句読点・かっこの閉じ・空白）
// 「を」は言葉の中にほとんど出ないので、次がひらがなでも切ってよい（「人を／えらんで」）
const BREAK_AFTER_ALWAYS = new Set(["、", "。", "，", "．", "・", "！", "？", "」", "』", "）", " ", "　", "を"]);
// この文字の後ろは、次がひらがなでなければ折り返してよい（よく使う助詞）。
// 「も」「や」は言葉の中にも多い（「もらおう」「やすみ」）ので入れない
const BREAK_AFTER_PARTICLE = new Set(["の", "に", "で", "は", "が", "と", "て", "へ"]);
// この文字の前なら折り返してよい（かぎかっこの開き）。「（」は入れない（「10月24日（土）」の曜日だけが次の行に落ちないように）
const BREAK_BEFORE = new Set(["「", "『"]);
// 行の頭に来てはいけない文字（この前では切らない。Android も避けるが、印の付け方でも切れ目にしない）
const NO_LINE_START = new Set([
  "、",
  "。",
  "，",
  "．",
  "・",
  "！",
  "？",
  "」",
  "』",
  "）",
  "ー",
  "ぁ",
  "ぃ",
  "ぅ",
  "ぇ",
  "ぉ",
  "っ",
  "ゃ",
  "ゅ",
  "ょ",
  "ァ",
  "ィ",
  "ゥ",
  "ェ",
  "ォ",
  "ッ",
  "ャ",
  "ュ",
  "ョ",
]);
const MIN_LINE = 8; // これより短い行は、そのまま（ほとんど1行に入る。数字・ラベルに触らない）
const LONG_UNIT = 12; // これより長い文節はまとめない（まとめると行の右が大きく空く）
const TAIL_MIN = 2;
const TAIL_MAX = 6;
const TAIL_FALLBACK = 4;

const isHiragana = (ch: string | undefined) => !!ch && ch >= "ぁ" && ch <= "ゖ";

// chars[i] と chars[i + 1] の間で折り返してよいか（文節の切れ目か）
function isBoundary(chars: readonly string[], i: number): boolean {
  const a = chars[i] ?? "";
  const b = chars[i + 1] ?? "";
  if (NO_LINE_START.has(b)) return false;
  if (BREAK_AFTER_ALWAYS.has(a) || BREAK_BEFORE.has(b)) return true;
  return BREAK_AFTER_PARTICLE.has(a) && !isHiragana(b);
}

// 行の終わりの言葉が始まる位置（最後の区切りの後の 2〜6 文字。なければ最後の4文字）
function tailStart(chars: readonly string[]): number {
  const n = chars.length;
  for (let i = n - 1 - TAIL_MIN; i >= n - 1 - TAIL_MAX; i--) {
    const c = chars[i] ?? "";
    if (BREAK_AFTER_ALWAYS.has(c) || BREAK_AFTER_PARTICLE.has(c)) return i + 1;
  }
  return n - TAIL_FALLBACK;
}

function glueLine(line: string): string {
  const chars = Array.from(line);
  const n = chars.length;
  if (n < MIN_LINE) return line;
  // glue[i] = chars[i] と chars[i + 1] の間に印を入れる
  const glue = new Array<boolean>(Math.max(0, n - 1)).fill(false);
  let unitStart = 0;
  for (let i = 0; i < n; i++) {
    const end = i === n - 1 || isBoundary(chars, i);
    if (!end) continue;
    if (i + 1 - unitStart <= LONG_UNIT) for (let k = unitStart; k < i; k++) glue[k] = true;
    unitStart = i + 1;
  }
  for (let k = Math.max(0, tailStart(chars)); k < n - 1; k++) glue[k] = true;
  let out = chars[0] ?? "";
  for (let k = 1; k < n; k++) out += (glue[k - 1] ? WORD_JOINER : "") + chars[k];
  return out;
}

export function keepTailTogether(text: string): string {
  if (text.includes(WORD_JOINER)) return text; // もう入れてある
  return text.split("\n").map(glueLine).join("\n");
}
