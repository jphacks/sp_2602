// Kotlin の監視に、許可の状態の送り先と合言葉を渡すか（D-113。src/lib/status-reporter.ts）のテスト。
import type { Session } from "@contracts/schemas";
import { describe, expect, it, vi } from "vitest";
import { applyStatusReporter, statusReporterAction } from "@/lib/status-reporter";

const URL = "https://example.test/api/device-status/report";
const child: Session = { token: "t-child", userId: "c1", name: "こども", role: "child" };

describe("statusReporterAction", () => {
  it("子どもとしてログインしていれば、送り先と合言葉を渡す", () => {
    expect(statusReporterAction({ status: "signedIn", session: child }, URL)).toEqual({
      kind: "set",
      url: URL,
      token: "t-child",
      childId: "c1",
    });
  });

  it("保護者・役割のない人・ログアウト（401 を含む）では消す", () => {
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: "parent" } }, URL)).toEqual({
      kind: "clear",
    });
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: null } }, URL)).toEqual({
      kind: "clear",
    });
    expect(statusReporterAction({ status: "signedOut" }, URL)).toEqual({ kind: "clear" });
  });

  it("確かめ中は何もしない（起動のたびに一度消してから渡し直さない）", () => {
    expect(statusReporterAction({ status: "checking" }, URL)).toEqual({ kind: "keep" });
  });
});

describe("applyStatusReporter", () => {
  it("決めたとおりに native を呼ぶ", () => {
    const target = { setStatusReporter: vi.fn(), clearStatusReporter: vi.fn() };
    applyStatusReporter({ kind: "set", url: URL, token: "t", childId: "c1" }, target);
    expect(target.setStatusReporter).toHaveBeenCalledWith(URL, "t", "c1");
    applyStatusReporter({ kind: "clear" }, target);
    expect(target.clearStatusReporter).toHaveBeenCalledTimes(1);
    applyStatusReporter({ kind: "keep" }, target);
    expect(target.setStatusReporter).toHaveBeenCalledTimes(1);
    expect(target.clearStatusReporter).toHaveBeenCalledTimes(1);
  });
});
