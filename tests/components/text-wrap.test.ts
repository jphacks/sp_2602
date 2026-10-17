// 文の終わりの言葉を1〜2文字だけ次の行に落とさない仕組み（src/components/text-wrap.ts。AppText が文字列に使う）。
// 1台の端末の幅に合わせて文の途中に手で入れていた改行（「テスト日程の\n一覧・変更」「このスマホを使う人を\nえらんでください」など）を
// やめたので、どの幅・文字の大きさでも「変／更」「くだ／さい」「ため／に、」のように切れないことを確かめる。
import { describe, expect, it } from "vitest";
import { tabBarHeight } from "@/components/tab-bar-size";
import { keepTailTogether, plainTextOf } from "@/components/text-wrap";

const WJ = String.fromCharCode(0x2060); // U+2060 WORD JOINER（目に見えない）

// 折り返してよい所（印がない文字の間）を「/」で見せる。長い行の切れ目を確かめるのに使う
const cuts = (s: string) => {
  let out = "";
  let joined = false;
  for (const ch of Array.from(s)) {
    if (ch === WJ) {
      joined = true;
      continue;
    }
    if (out && !joined) out += "/";
    out += ch;
    joined = false;
  }
  return out;
};

describe("keepTailTogether", () => {
  it("行の途中も文節（助詞・句読点の後）の切れ目でだけ折り返す（実機で「出すため／に、」「か／ら入れられます」と切れていた）", () => {
    expect(cuts(keepTailTogether("時間が終わったときに案内を出すために、次の設定をオンにしてください"))).toBe(
      "時間が/終わったときに/案内を/出すために、/次の/設定を/オンに/してください",
    );
    expect(cuts(keepTailTogether("テストの日程は「日程登録」から入れられます"))).toBe(
      "テストの/日程は/「日程登録」/から入れられます",
    );
    expect(cuts(keepTailTogether("見守りが途中で止まらないようにします"))).toBe(
      "見守りが/途中で/止まらないようにします",
    );
    expect(
      cuts(keepTailTogether("テストが近づくほど上限が少しずつ小さくなり、テストが終わると一度少し戻ります。")),
    ).toBe("テストが/近づくほど上限が/少しずつ小さくなり、/テストが/終わると/一度少し戻ります。");
  });

  it("助詞でも、次がひらがななら言葉の中なので切らない（「とき」「でき」「ながら」を割らない）", () => {
    expect(cuts(keepTailTogether("このスマホを使う人をえらんでください"))).toBe(
      "この/スマホを/使う人を/えらんでください",
    );
    expect(cuts(keepTailTogether("保護者のスマホで、このQRコードを読み取ってもらおう"))).toBe(
      "保護者の/スマホで、/この/QRコードを/読み取ってもらおう",
    );
  });

  it("前が漢字・カタカナの助詞（名詞の後）は、次がひらがなでも切ってよい。「が」「て」は言葉の中に多いので切らない", () => {
    expect(cuts(keepTailTogether("選んだアプリは、使用時間にふくまれなくなります。"))).toBe(
      "選んだアプリは、/使用時間に/ふくまれなくなります。",
    );
    expect(cuts(keepTailTogether("今の計画での上限の下がり方を見る"))).toBe("今の/計画での/上限の/下がり方を/見る");
  });

  it("句読点・かっこの閉じ・小さい「ゃ」などを行の頭にしない", () => {
    // 「・」でつないだ短い組（「一覧・変更」）は割らない（親04 で「テスト日程の一覧・／変更」と切れていた）
    expect(cuts(keepTailTogether("テスト日程の一覧・変更"))).toBe("テスト日程の/一覧・変更");
    expect(cuts(keepTailTogether("もう一度つくりましょう。あとで"))).toBe("もう一度つくりましょう。/あとで");
    expect(cuts(keepTailTogether("10月24日（土）〜10月25日（日）の中間を登録しました。"))).toBe(
      "10月24日（土）/〜10月25日（日）/の/中間を/登録しました。",
    );
  });

  it("長すぎる文節は、ひらがなの後に漢字・カタカナが来る所で分けてまとめる（親03 で「少／しずつ」と切れていた）", () => {
    expect(cuts(keepTailTogether("今日の上限は 180分 です。明日から少しずつ下がっていきます。"))).toBe(
      "今日の/上限は/ /180分 /です。/明日から/少しずつ/下がっていきます。",
    );
  });

  it("それでも長い文節は、かっこの開きの前と名詞の後の「が」の後で分ける（空白期間の帯で「なく／なります」と切れていた）", () => {
    expect(
      cuts(keepTailTogether("空白期間のあいだは、1日の上限がなくなります（制限なし）。終わると元の上限に戻ります。")),
    ).toBe("空白期間の/あいだは、/1日の/上限が/なくなります/（制限なし）。/終わると/元の/上限に/戻ります。");
  });

  it("長すぎる文節はまとめない（行の右が大きく空くので）。ただし行の終わりの4文字はまとめる", () => {
    expect(cuts(keepTailTogether("ABCDEFGHIJKLMNOP"))).toBe("A/B/C/D/E/F/G/H/I/J/K/L/MNOP");
  });

  it("文の区切り（。の後の改行）は残し、行ごとにまとめる", () => {
    const out = keepTailTogether("QRコードは10分たつと使えなくなります。\nもう一度つくりましょう。");
    expect(out.split("\n").map(cuts)).toEqual(["QRコードは/10分たつと/使えなくなります。", "もう一度つくりましょう。"]);
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

describe("plainTextOf", () => {
  it("値を差し込んだ文（文字と数の配列）も1つの文字列にする（親03 の「今日の上限は {分}分 です。…」に印が入っていなかった）", () => {
    expect(plainTextOf(["今日の上限は ", 180, "分 です。明日から少しずつ下がっていきます。"])).toBe(
      "今日の上限は 180分 です。明日から少しずつ下がっていきます。",
    );
    expect(plainTextOf("設定")).toBe("設定");
  });

  it("文字でないもの（入れ子の文字・部品）が混ざっていれば触らない", () => {
    expect(plainTextOf(["あ", { type: "Text" }])).toBeNull();
    expect(plainTextOf(46)).toBeNull();
    expect(plainTextOf([])).toBeNull();
    expect(plainTextOf(null)).toBeNull();
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
