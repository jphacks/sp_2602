// 子ども用の見た目の書体。React を使わない部分だけをここに置く（tests/kids/ から確かめる）。
//   子どもの画面の文字は、どのテーマでも全部 BIZ UDPGothic（見出し・数字＝Bold 700、本文＝Regular 400。D-134）
//   上のバーのアプリ名のロゴ「Slope」だけ Londrina Solid（900。アイコンと同じ字形の図として扱う）
//   スタイルに書く名前と太さは src/kids/theme/tool.ts の fonts（写した元 tmp/animations と同じ）
// 書体のファイル（Google Fonts の OFL の TTF）は assets/fonts/。ライセンスの文は同じフォルダの OFL-*.txt。
//
// なぜ名前を直すのか: 写した部品（src/kids/components など）は、ブラウザの確認ページと同じく
//   { fontFamily: "BIZ UDPGothic", fontWeight: "700" } のように「書体の名前＋太さ」で書いている。
//   Android は、読み込んだ書体に太さを付けると、太字のファイルを選ばずに字を機械で太らせる（字がつぶれる）。
//   だから、描く直前（src/kids/lib/text.tsx の Text・TextInput）に、名前と太さの組を「読み込んだファイルの名前＋太さなし」に直す。
//   太さの違うファイルがない書体（Londrina Solid は 900 だけ）は、いちばん近い太さのファイルにする。
import type { TextStyle } from "react-native";

// 読み込む名前（expo-font の useFonts の鍵）→ 書体の名前と太さ
export const KIDS_FONT_FACES = {
  "BIZUDPGothic-Regular": { family: "BIZ UDPGothic", weight: 400 },
  "BIZUDPGothic-Bold": { family: "BIZ UDPGothic", weight: 700 },
  "LondrinaSolid-Black": { family: "Londrina Solid", weight: 900 },
} as const;

export type KidsFontFace = keyof typeof KIDS_FONT_FACES;

// 書体の名前 → [太さ, 読み込む名前] の一覧
const FAMILIES = new Map<string, [number, KidsFontFace][]>();
for (const [face, { family, weight }] of Object.entries(KIDS_FONT_FACES) as [
  KidsFontFace,
  { family: string; weight: number },
][]) {
  const list = FAMILIES.get(family) ?? [];
  list.push([weight, face]);
  FAMILIES.set(family, list);
}

// fontWeight（"700"・"bold"・700・なし）を数にする。読めないときは 400
export function weightOf(w: TextStyle["fontWeight"]): number {
  if (w === undefined || w === "normal" || w === "regular") return 400;
  if (w === "bold") return 700;
  const n = typeof w === "number" ? w : Number.parseInt(String(w), 10);
  return Number.isFinite(n) ? n : 400;
}

// 書体の名前と太さ → 読み込んだファイルの名前。知らない書体（アプリの既定の書体など）は null（そのまま描く）。
// 同じだけ近い太さが2つあるときは太いほう（CSS の決め方と同じく、500 より上を頼まれたら太いほうへ寄せる）
export function fontFaceFor(family: string | undefined, weight: TextStyle["fontWeight"]): KidsFontFace | null {
  if (!family) return null;
  const list = FAMILIES.get(family);
  if (!list) return null;
  const want = weightOf(weight);
  let best: [number, KidsFontFace] | null = null;
  for (const item of list) {
    if (!best) {
      best = item;
      continue;
    }
    const d = Math.abs(item[0] - want);
    const bd = Math.abs(best[0] - want);
    if (d < bd || (d === bd && item[0] > best[0])) best = item;
  }
  return best ? best[1] : null;
}

// 1つにまとめたスタイル（StyleSheet.flatten の結果）から、上に重ねる書体のスタイル。直さなくてよいときは null
export function fontOverride(flat: TextStyle | undefined): { fontFamily: KidsFontFace; fontWeight: "normal" } | null {
  const face = fontFaceFor(flat?.fontFamily, flat?.fontWeight);
  return face ? { fontFamily: face, fontWeight: "normal" } : null;
}

// ── Android で字が切れないための決まり（src/kids/lib/text.tsx が描く直前に使う） ──
// Android の文字の箱（TextView）は、箱からはみ出した字の形を切り取って描く（ブラウザははみ出しても描く）。
// だから、ブラウザで見えていても、Android では次の2つで字が欠けることがある。
//   1. letterSpacing: React Native（0.88）の Android は、字の間を「測るとき」と「描くとき」で別々に入れていて、
//      描くほうが少し広くなる。最後の字が次の行へ回され、1行分の高さの箱で切られて消える
//      （上のバーの「Slope」が「Slop」になった。letterSpacing 0.3 を外すと出る）。
//      → Android では letterSpacing を外す（0.3 程度なら見た目はほとんど変わらない）。
//   2. lineHeight が書体の高さより小さいと、上下の半分ずつを詰める（React Native もブラウザと同じ決め方）。
//      詰めすぎると、字の形（「ぜ」の濁点・「y」の下など）が箱の上下からはみ出して切れる。
//      → 書体ごとの高さ（下の表）から、はみ出す量を計算して確かめる（開発中の端末では console.warn で知らせる）。

// 書体ごとの高さ（1em あたり）。ascent・descent は書体のファイルの hhea（Android が行の高さに使う値）、
// inkTop・inkBottom は字の形のいちばん上・下（ASCII・かな・漢字・全角の記号の中で。fontTools で assets/fonts の TTF を測った値）
//   digits … 数字（0〜9・％）だけを描くときの字の形の上下（数字は下に出ない）
export const KIDS_FONT_METRICS: Record<
  KidsFontFace,
  { ascent: number; descent: number; inkTop: number; inkBottom: number; digits?: { inkTop: number; inkBottom: number } }
> = {
  "BIZUDPGothic-Regular": { ascent: 1802 / 2048, descent: 246 / 2048, inkTop: 1788 / 2048, inkBottom: 244 / 2048 },
  "BIZUDPGothic-Bold": { ascent: 1802 / 2048, descent: 246 / 2048, inkTop: 1798 / 2048, inkBottom: 244 / 2048 },
  "LondrinaSolid-Black": {
    ascent: 0.945,
    descent: 0.238,
    inkTop: 0.758,
    inkBottom: 0.213,
    digits: { inkTop: 0.719, inkBottom: 0.017 },
  },
};

// 1行の箱から、字の形が上・下に何 dp はみ出すか（はみ出さなければ 0）。lineHeight がなければ書体の高さのまま（はみ出さない）
//   text … 描く文字（分かるとき）。数字だけなら数字の上下で見る
export function inkOverflow(
  face: KidsFontFace,
  fontSize: number,
  lineHeight: number | undefined,
  text?: string,
): { top: number; bottom: number } {
  if (lineHeight == null) return { top: 0, bottom: 0 };
  const m = KIDS_FONT_METRICS[face];
  const ink = m.digits && text != null && /^[0-9０-９%％]+$/.test(text) ? m.digits : m;
  const ascent = m.ascent * fontSize;
  const descent = m.descent * fontSize;
  // 行の高さとの差（leading）を上下に半分ずつ（React Native の CustomLineHeightSpan・CSS と同じ）
  const half = (lineHeight - (ascent + descent)) / 2;
  const round = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return {
    top: round(ink.inkTop * fontSize - (ascent + half)),
    bottom: round(ink.inkBottom * fontSize - (descent + half)),
  };
}

// 字が切れたとみなす量（dp）。端末の画素に丸めるずれ（1px 足らず）は数えない
export const INK_OVERFLOW_TOLERANCE = 0.4;

// Android で描く前に上に重ねるスタイル（letterSpacing を外す）。直さなくてよいときは null
export function androidTextPatch(flat: TextStyle | undefined): { letterSpacing: 0 } | null {
  return flat?.letterSpacing ? { letterSpacing: 0 } : null;
}
