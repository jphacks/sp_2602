// 文の終わりの言葉を1〜2文字だけ次の行に落とさない仕組み（src/components/text-wrap.ts。AppText が文字列に使う）。
// 1台の端末の幅に合わせて文の途中に手で入れていた改行（「テスト日程の\n一覧・変更」「このスマホを使う人を\nえらんでください」など）を
// やめたので、どの幅・文字の大きさでも「変／更」「くだ／さい」のように切れないことを確かめる。
import { describe, expect, it } from "vitest";
import { tabBarHeight } from "@/components/tab-bar-size";
import { keepTailTogether } from "@/components/text-wrap";

const WJ = String.fromCharCode(0x2060); // U+2060 WORD JOINER（目に見えない）
// 印（改行しない所）を「|」に置き換えて、どこがまとまったかを見やすくする
const show = (s: string) => s.replaceAll(WJ, "|");

describe("keepTailTogether", () => {
  it("最後の区切り（助詞・句読点）の後の言葉をまとめる", () => {
    expect(show(keepTailTogether("テスト日程の一覧・変更"))).toBe("テスト日程の一覧・変|更");
    expect(show(keepTailTogether("テーマカラーの変更"))).toBe("テーマカラーの変|更");
    expect(show(keepTailTogether("このスマホを使う人をえらんでください"))).toBe(
      "このスマホを使う人をえらんでく|だ|さ|い",
    );
    expect(show(keepTailTogether("通信を確かめて、もう一度ためしてください。"))).toBe(
      "通信を確かめて、もう一度ためしてく|だ|さ|い|。",
    );
  });

  it("「も」「や」は言葉の中にも多いので区切りにしない（「もらおう」を「も／らおう」にしない）", () => {
    expect(show(keepTailTogether("保護者のスマホで、このQRコードを読み取ってもらおう"))).toBe(
      "保護者のスマホで、このQRコードを読み取っても|ら|お|う",
    );
  });

  it("区切りが見つからなければ最後の4文字をまとめる", () => {
    expect(show(keepTailTogether("ABCDEFGHIJKL"))).toBe("ABCDEFGHI|J|K|L");
  });

  it("文の区切り（。の後の改行）は残し、行ごとにまとめる", () => {
    expect(show(keepTailTogether("QRコードは10分たつと使えなくなります。\nもう一度つくりましょう。"))).toBe(
      "QRコードは10分たつと使えなくなり|ま|す|。\nもう一度つくりまし|ょ|う|。",
    );
  });

  it("短い文字（数字・ラベル）と、もうまとめてある文字はそのまま", () => {
    expect(keepTailTogether("46")).toBe("46");
    expect(keepTailTogether("設定")).toBe("設定");
    const once = keepTailTogether("テスト日程の一覧・変更");
    expect(keepTailTogether(once)).toBe(once);
  });

  it("印を除けば、もとの文字と同じ（見た目の文字は変えない）", () => {
    const text = "子どものスマホのQRコードを読み取るために、カメラを使います。";
    expect(keepTailTogether(text).replaceAll(WJ, "")).toBe(text);
  });
});

describe("tabBarHeight", () => {
  it("文字 1.0 倍は Figma の 80 にナビゲーションボタンの高さを足すだけ", () => {
    expect(tabBarHeight(0, 1)).toBe(80);
    expect(tabBarHeight(48, 1)).toBe(128);
  });

  it("文字を大きくした端末では、文字の行が高くなった分だけ高くする（1.3 倍で 80 のままだと文字の下が切れていた）", () => {
    expect(tabBarHeight(0, 1.3)).toBe(85);
    expect(tabBarHeight(0, 2)).toBe(96);
  });

  it("文字を小さくした端末・分からない値では 80 より低くしない", () => {
    expect(tabBarHeight(0, 0.85)).toBe(80);
    expect(tabBarHeight(0, Number.NaN)).toBe(80);
  });
});
