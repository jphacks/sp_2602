// Kotlin の監視に、許可の状態の送り先と合言葉を渡すか（D-113。src/lib/status-reporter.ts）のテスト。
import type { Session } from "@contracts/schemas";
import { describe, expect, it, vi } from "vitest";
import { applyStatusReporter, statusReporterAction } from "@/lib/status-reporter";

const URL = "https://example.test/api/device-status/report";
const child: Session = { token: "t-child", userId: "c1", name: "こども", role: "child" };

describe("statusReporterAction", () => {
  it("子どもとしてログインしていれば、送り先と合言葉を渡す（監視が動いていても・いなくても）", () => {
    for (const monitoring of [false, true])
      expect(statusReporterAction({ status: "signedIn", session: child }, URL, monitoring)).toEqual({
        kind: "set",
        url: URL,
        token: "t-child",
        childId: "c1",
      });
  });

  it("監視が動いていない端末（保護者・連携前）: 保護者・役割のない人・ログアウト（401 を含む）では消す", () => {
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: "parent" } }, URL, false)).toEqual({
      kind: "clear",
    });
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: null } }, URL, false)).toEqual({
      kind: "clear",
    });
    expect(statusReporterAction({ status: "signedOut" }, URL, false)).toEqual({ kind: "clear" });
  });

  it("監視が動いている端末: JS がログアウト状態になっても（理由のない 401・封が開けられない）消さない。役割のない人・保護者で入り直しても消さない", () => {
    // Kotlin が残した合言葉で確かめ続け、あとで保護者が外したら family_unlink を受けて止まれるように
    expect(statusReporterAction({ status: "signedOut" }, URL, true)).toEqual({ kind: "keep" });
    const expired = { status: "signedOut" as const, error: { code: "unauthorized", message: "期限切れ", hint: "" } };
    expect(statusReporterAction(expired, URL, true)).toEqual({ kind: "keep" });
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: null } }, URL, true)).toEqual({
      kind: "keep",
    });
    expect(statusReporterAction({ status: "signedIn", session: { ...child, role: "parent" } }, URL, true)).toEqual({
      kind: "keep",
    });
  });

  it("確かめ中は何もしない（起動のたびに一度消してから渡し直さない）", () => {
    expect(statusReporterAction({ status: "checking" }, URL, false)).toEqual({ kind: "keep" });
    expect(statusReporterAction({ status: "checking" }, URL, true)).toEqual({ kind: "keep" });
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
