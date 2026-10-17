// 画面の本文をキーボードの分だけ縮める（Screen.tsx の KeyboardAvoidingView）のを、いつ効かせるかのテスト（src/components/keyboard-avoid.ts）。
// 実機 SC-53C・Android 16 で、ほかのアプリのキーボードを出したまま Slope に戻ると keyboardDidShow が届き、
// 入力欄のない子01 ホームの中身がずれた。Slope の入力欄にフォーカスがあるときだけ縮めることを確かめる。
import { describe, expect, it } from "vitest";
import { nextKeyboardAvoid } from "@/components/keyboard-avoid";

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

  it("前面に戻っただけでは、今の状態を変えない（本物のキーボードならこのあと show が届く）", () => {
    expect(nextKeyboardAvoid(false, { kind: "appState", active: true })).toBe(false);
    expect(nextKeyboardAvoid(true, { kind: "appState", active: true })).toBe(true);
  });
});
