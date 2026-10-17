// 日本語の文の終わりの短い言葉が、1〜2文字だけ次の行に落ちないようにする（AppText が文字列に使う。React Native を読まない純粋な関数）。
// なぜ: Android は日本語をどの文字の間でも折り返すので、幅や文字の大きさによって「くだ／さい」「変／更」「…ため／に、」のように切れる。
//   これまでは1台の端末（Figma の幅）に合わせて文の途中に手で改行（\n）を入れていたが、幅や文字の大きさが違う端末では
//   かえって変な所で切れる。手の改行はやめ、どの端末でも「行の終わりの言葉はまとめて折り返す」だけを決める。
// やり方: 各行（\n で分けた1行）の終わりの言葉（最後の区切り — 句読点・助詞 — の後の 2〜6 文字。見つからなければ最後の4文字）の
//   文字の間に、目に見えない「ここでは改行しない」印（U+2060 WORD JOINER）を入れる。折り返しが要らない幅なら見た目は何も変わらない。
const WORD_JOINER = String.fromCharCode(0x2060); // 目に見えない文字なので、ソースには番号で書く
// この文字の後ろなら折り返してよい（句読点・かっこの閉じ・よく使う助詞）。
// 「も」「や」は言葉の中にも多い（「もらおう」「やすみ」）ので入れない
const BREAK_AFTER = new Set([
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
  " ",
  "　",
  "の",
  "を",
  "に",
  "で",
  "は",
  "が",
  "と",
  "て",
  "へ",
]);
const MIN_LINE = 8; // これより短い行は、そのまま（ほとんど1行に入る。数字・ラベルに触らない）
const TAIL_MIN = 2;
const TAIL_MAX = 6;
const TAIL_FALLBACK = 4;

function glueTail(line: string): string {
  const chars = Array.from(line);
  const n = chars.length;
  if (n < MIN_LINE) return line;
  let start = n - TAIL_FALLBACK;
  for (let i = n - 1 - TAIL_MIN; i >= n - 1 - TAIL_MAX; i--) {
    if (BREAK_AFTER.has(chars[i] ?? "")) {
      start = i + 1;
      break;
    }
  }
  return chars.slice(0, start).join("") + chars.slice(start).join(WORD_JOINER);
}

export function keepTailTogether(text: string): string {
  if (text.includes(WORD_JOINER)) return text; // もう入れてある
  return text.split("\n").map(glueTail).join("\n");
}
