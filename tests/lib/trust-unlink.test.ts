// 配線のテスト（再検査で「壊しても落ちなかった」ところ）。
//   - session.tsx → session-core の trustUnlink: API の送り先（apiUrl）と __DEV__ から、family_unlink を信じるかを決める
//     （src/lib/trust-unlink.ts。React を描かずに確かめる）
//   - session.tsx → status-reporter: 監視が動いているか（native.isEngineEnabled）を渡す
//   - Kotlin の StatusReporter・SessionCheck は、返事のあとにすることを StatusReportRules.replyAction（中で guardUnlinked を通す）で決める
//     （組み合わせそのものは JVM のテスト StatusReportTest で確かめる）
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const repo = path.resolve(__dirname, "../..");
// コメントを外したコード（コメントに書いた名前で通ってしまわないように）
const code = (...p: string[]) =>
  fs
    .readFileSync(path.join(repo, ...p), "utf8")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");

// API の送り先（EXPO_PUBLIC_API_URL）と __DEV__ を決めてから、trust-unlink.ts を読み直す（api.ts は読み込むときに送り先を決める）
async function trustWith(apiUrl: string | undefined, dev: boolean | undefined): Promise<boolean> {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_API_URL", apiUrl ?? "");
  if (dev !== undefined) vi.stubGlobal("__DEV__", dev);
  const { trustUnlinkForApp } = await import("@/lib/trust-unlink");
  return trustUnlinkForApp();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("trustUnlinkForApp: family_unlink を信じるか（apiUrl と __DEV__ から決める）", () => {
  it("送り先が https なら、release 版（__DEV__ が false）でも信じる", async () => {
    expect(await trustWith("https://slope.example.test", false)).toBe(true);
  });

  it("送り先が http の release 版では信じない（偽のプロキシの 401 で止められないように）", async () => {
    expect(await trustWith("http://192.168.0.5:3000", false)).toBe(false);
    // 送り先を書いていない（既定の http://10.0.2.2:3000）・__DEV__ がない（Node）ときも信じない
    expect(await trustWith(undefined, undefined)).toBe(false);
  });

  it("開発中（__DEV__ が true）なら http でも信じる", async () => {
    expect(await trustWith("http://192.168.0.5:3000", true)).toBe(true);
  });
});

describe("session.tsx の配線", () => {
  const session = code("src", "lib", "session.tsx");

  it("session-core の trustUnlink に trustUnlinkForApp をそのまま渡す（いつも true などにしない）", () => {
    expect(session).toMatch(/trustUnlink:\s*trustUnlinkForApp\s*,/);
    expect(session).toMatch(/import \{ trustUnlinkForApp \} from "\.\/trust-unlink";/);
  });

  it("statusReporterAction に、監視が動いているか（native.isEngineEnabled()）を渡す", () => {
    expect(session).toMatch(
      /statusReporterAction\(state,\s*apiUrl\("deviceStatusReport"\),\s*native\.isEngineEnabled\(\)\)/,
    );
  });
});

describe("Kotlin の配線: 返事のあとにすることは replyAction（guardUnlinked を通す）だけで決める", () => {
  const engine = [
    "modules",
    "kit-native",
    "android",
    "src",
    "main",
    "java",
    "dev",
    "hackathon",
    "kit",
    "kitnative",
    "engine",
  ];
  for (const file of ["StatusReporter.kt", "SessionCheck.kt"]) {
    it(`${file}: StatusReportRules.replyAction を呼び、結果（ReportOutcome）を直接は分けない`, () => {
      const kt = code(...engine, file);
      expect(kt).toContain("StatusReportRules.replyAction(");
      expect(kt).not.toMatch(/ReportOutcome\.(Sent|Unlinked|Unauthorized)\s*->/);
      expect(kt).not.toMatch(/is ReportOutcome\.Failed\s*->/);
    });
  }

  it("replyAction は guardUnlinked を通す", () => {
    const rules = code(...engine, "StatusReport.kt");
    const body = rules.slice(rules.indexOf("fun replyAction("));
    expect(body.slice(0, body.indexOf("\n    }"))).toContain("guardUnlinked(outcome, url, debuggable)");
  });
});
