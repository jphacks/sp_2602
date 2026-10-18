// 通常上限の入力（Q7。0〜1440 分を「時間」と「分」で入れる）と、ログイン画面（子08・子09）の分かれ道のテスト。
import type { ApiError } from "@contracts/errors";
import { describe, expect, it } from "vitest";
import { googleOutcome, loginNotice, serverFailure } from "@/components/pair/login-view";
import {
  formatHoursMinutes,
  parseUsualLimit,
  splitMinutes,
  usualLimitExit,
  usualLimitFromOf,
} from "@/components/pair/usual-limit-input";

// 親01 の帯から来たのに、閉じると入口へ置き換えていたので、ホームの上にもう1つホームが重なり、
// Android の戻るボタンでホームからホームへ戻っていた（回帰テスト）
describe("通常上限の画面を閉じたときの行き先", () => {
  it("親01 のホームから来た（from=home）なら戻る", () => {
    expect(usualLimitExit(usualLimitFromOf("home"))).toBe("back");
  });

  it("紐づけの直後（from なし・知らない値）なら入口で振り分け直す", () => {
    expect(usualLimitExit(usualLimitFromOf(undefined))).toBe("entry");
    expect(usualLimitExit(usualLimitFromOf("other"))).toBe("entry");
    expect(usualLimitExit(usualLimitFromOf(["home"]))).toBe("entry");
  });
});

describe("通常上限の入力", () => {
  it("時間と分を分に直す", () => {
    expect(parseUsualLimit("3", "0")).toEqual({ ok: true, minutes: 180 });
    expect(parseUsualLimit("1", "30")).toEqual({ ok: true, minutes: 90 });
  });

  it("片方だけ入れたら、もう片方は 0", () => {
    expect(parseUsualLimit("", "45")).toEqual({ ok: true, minutes: 45 });
    expect(parseUsualLimit("2", "")).toEqual({ ok: true, minutes: 120 });
  });

  it("0 分も有効な上限（その日は使えない）。24時間0分（1440）まで", () => {
    expect(parseUsualLimit("0", "0")).toEqual({ ok: true, minutes: 0 });
    expect(parseUsualLimit("24", "0")).toEqual({ ok: true, minutes: 1440 });
    expect(parseUsualLimit("24", "1")).toEqual({ ok: false, error: "1日の上限は 24時間0分 までです" });
  });

  it("全角の数字も受け付ける", () => {
    expect(parseUsualLimit("２", "１５")).toEqual({ ok: true, minutes: 135 });
  });

  it("空・数字でない・分が 60 以上はエラー（勝手に 0 分にしない）", () => {
    expect(parseUsualLimit("", " ")).toEqual({ ok: false, error: "時間と分を入れてください" });
    expect(parseUsualLimit("1.5", "")).toEqual({ ok: false, error: "数字で入れてください" });
    expect(parseUsualLimit("-1", "0")).toEqual({ ok: false, error: "数字で入れてください" });
    expect(parseUsualLimit("1", "60")).toEqual({ ok: false, error: "分は 0〜59 で入れてください" });
  });

  it("保存済みの分を入力欄に戻す・「3時間0分」の表記（親02 と同じ）", () => {
    expect(splitMinutes(185)).toEqual({ hours: "3", minutes: "5" });
    expect(splitMinutes(0)).toEqual({ hours: "0", minutes: "0" });
    expect(formatHoursMinutes(180)).toBe("3時間0分");
    expect(formatHoursMinutes(1440)).toBe("24時間0分");
  });
});

describe("ログイン（子08・子09）", () => {
  it("Google: 成功は idToken をサーバへ、やめたは何も出さない、失敗は子09", () => {
    expect(googleOutcome({ status: "success", idToken: "tok" })).toEqual({ kind: "token", idToken: "tok" });
    expect(googleOutcome({ status: "cancelled" })).toEqual({ kind: "none" });
    expect(googleOutcome({ status: "error", message: "Google ログインに失敗しました" })).toEqual({
      kind: "failure",
      failure: { detail: "Google ログインに失敗しました" },
    });
  });

  it("サーバが断った・通信できない → 子09 に何が起きたかを添える", () => {
    const e: ApiError = { code: "network", message: "通信できませんでした", hint: "接続を確認して" };
    expect(serverFailure(e)).toEqual({ detail: "通信できませんでした" });
  });

  it("期限切れで戻ってきたときだけ、押す前に帯で知らせる（押した後はダイアログで知らせる）", () => {
    const expired: ApiError = { code: "unauthorized", message: "ログインの期限が切れました", hint: "もう一度" };
    expect(loginNotice(expired, false)).toBe(expired);
    expect(loginNotice(expired, true)).toBeNull();
    expect(loginNotice(null, false)).toBeNull();
    expect(loginNotice({ ...expired, code: "network" }, false)).toBeNull();
  });
});
