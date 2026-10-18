// 画面の本文をキーボードの分だけ縮める（Screen.tsx の KeyboardAvoidingView）のを、いつ効かせるかのテスト（src/components/keyboard-avoid.ts）。
// 実機 SC-53C・Android 16 で、ほかのアプリのキーボードを出したまま Slope に戻ると keyboardDidShow が届き、
// 入力欄のない子01 ホームの中身がずれた。Slope の入力欄にフォーカスがあるときだけ縮めることを確かめる。
import { describe, expect, it } from "vitest";
import { type KeyboardAvoidEvent, nextKeyboardAvoid } from "@/components/keyboard-avoid";

describe("nextKeyboardAvoid", () => {
  it("Slope の入力欄にフォーカスがあってキーボードが出たら、縮める", () => {
    expect(nextKeyboardAvoid(false, { kind: "show", focusedInput: true })).toBe(true);
  });

  it("入力欄にフォーカスがないのに届いたキーボードの合図（ほかのアプリから戻った瞬間）では、縮めない", () => {
    expect(nextKeyboardAvoid(false, { kind: "show", focusedInput: false })).toBe(false);
    expect(nextKeyboardAvoid(true, { kind: "show", focusedInput: false })).toBe(false);
  });

  it("キーボードが閉じたら、やめる", () => {
    expect(nextKeyboardAvoid(true, { kind: "hide" })).toBe(false);
  });

  it("アプリが裏へ回ったら、やめる（hide が届かなくても残さない）", () => {
    expect(nextKeyboardAvoid(true, { kind: "appState", active: false })).toBe(false);
  });

  // 機種によらない決まりであることの確かめ: 合図の届き方（hide が来ない・show が2回来る・前面に戻る順番）が機種で違っても、
  // 「Slope の入力欄にフォーカスがあるときに出たキーボード」だけで縮み、それ以外で縮んだまま残らない
  it("合図の届き方が機種で違っても、縮んだまま残らない", () => {
    const run = (events: KeyboardAvoidEvent[]) => events.reduce(nextKeyboardAvoid, false);
    // 入力中 → ほかのアプリへ（hide が来ない）→ 戻った瞬間にほかのアプリのキーボードの合図だけ届く（hide も来ない）
    expect(
      run([
        { kind: "show", focusedInput: true },
        { kind: "appState", active: false },
        { kind: "appState", active: true },
        { kind: "show", focusedInput: false },
      ]),
    ).toBe(false);
    // 戻ったあと入力欄を押してキーボードが出たら、また縮める（入力欄がキーボードに隠れない）
    expect(
      run([
        { kind: "show", focusedInput: false },
        { kind: "appState", active: true },
        { kind: "show", focusedInput: true },
      ]),
    ).toBe(true);
    // キーボードの高さが変わって show が続けて届いても（絵文字の切り替えなど）縮めたまま
    expect(
      run([
        { kind: "show", focusedInput: true },
        { kind: "show", focusedInput: true },
      ]),
    ).toBe(true);
  });

  it("前面に戻っただけでは、今の状態を変えない（本物のキーボードならこのあと show が届く）", () => {
    expect(nextKeyboardAvoid(false, { kind: "appState", active: true })).toBe(false);
    expect(nextKeyboardAvoid(true, { kind: "appState", active: true })).toBe(true);
  });
});
