// Kotlin の合言葉の確かめ（D-134。modules/kit-native/.../engine/SessionCheck.kt）は、許可の状態の送り先の URL から
// authCheck の URL を作る（道筋を Kotlin に書いている）。契約（contracts/api.ts）の道筋を変えたら、ここで気づけるようにする
import fs from "node:fs";
import path from "node:path";
import { api } from "@contracts/api";
import { describe, expect, it } from "vitest";

const kotlin = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/engine/SessionCheck.kt",
  ),
  "utf8",
);
const constOf = (name: string) => new RegExp(`const val ${name} = "([^"]+)"`).exec(kotlin)?.[1];

describe("Kotlin の合言葉の確かめの道筋（D-134）", () => {
  it("送り先（deviceStatusReport）と確かめ（authCheck）の道筋が契約と同じ", () => {
    expect(constOf("REPORT_PATH")).toBe(api.deviceStatusReport.path);
    expect(constOf("CHECK_PATH")).toBe(api.authCheck.path);
    expect(api.authCheck.method).toBe("GET");
  });
});
