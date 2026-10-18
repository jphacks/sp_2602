// plugins/with-release-signing.ts の書き換え（release を debug 鍵で署名しない）を、prebuild の雛形の一部で確かめる。
// 雛形が変わって書き換えられないときに、黙って debug 鍵のままにしないことも確かめる。

import { describe, expect, it } from "vitest";
import { applyReleaseSigning } from "../../plugins/with-release-signing";

// npx expo prebuild（Expo 58）が作る android/app/build.gradle の該当部分
const TEMPLATE = `def jscFlavor = 'io.github.react-native-community:jsc-android:2026004.+'

android {
    namespace 'com.quedotcom.androidslope'
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

function block(gradle: string, start: string): string {
  const from = gradle.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  // 開きかっこと閉じかっこを数えて、その区切りの終わりまでを返す
  let depth = 0;
  for (let i = gradle.indexOf("{", from); i < gradle.length; i++) {
    if (gradle[i] === "{") depth++;
    if (gradle[i] === "}") depth--;
    if (depth === 0) return gradle.slice(from, i + 1);
  }
  throw new Error(`閉じかっこがない: ${start}`);
}

describe("with-release-signing", () => {
  const out = applyReleaseSigning(TEMPLATE);
  const buildTypes = block(out, "buildTypes {");

  it("release は自分たちの鍵（signingConfigs.release）で署名し、debug 鍵を使わない", () => {
    const release = block(buildTypes, "release {");
    expect(release).toContain("signingConfig signingConfigs.release");
    expect(release).not.toContain("signingConfigs.debug");
  });

  it("debug はこれまでどおり debug 鍵で署名する", () => {
    expect(block(buildTypes, "debug {")).toContain("signingConfig signingConfigs.debug");
  });

  it("鍵の値は SLOPE_UPLOAD_* から読み、リポジトリに値を書かない", () => {
    const release = block(block(out, "signingConfigs {"), "release {");
    expect(release).toContain("storeFile file(slopeSigning.SLOPE_UPLOAD_STORE_FILE)");
    expect(release).toContain("keyPassword slopeSigning.SLOPE_UPLOAD_KEY_PASSWORD");
    for (const name of [
      "SLOPE_UPLOAD_STORE_FILE",
      "SLOPE_UPLOAD_STORE_PASSWORD",
      "SLOPE_UPLOAD_KEY_ALIAS",
      "SLOPE_UPLOAD_KEY_PASSWORD",
    ]) {
      expect(out).toContain(`'${name}'`);
    }
  });

  it("値が足りないときに止める確認を、android { より前で preReleaseBuild につなぐ", () => {
    const check = out.indexOf("tasks.register('slopeCheckReleaseSigning')");
    expect(check).toBeGreaterThanOrEqual(0);
    expect(check).toBeLessThan(out.indexOf("\nandroid {"));
    expect(out).toContain("tasks.matching { it.name == 'preReleaseBuild' }");
    expect(out).toContain("throw new GradleException(");
    expect(out).toContain("System.getenv('EAS_BUILD') == 'true'");
  });

  it("2回かけても同じ（prebuild を --clean なしで繰り返しても二重にならない）", () => {
    expect(applyReleaseSigning(out)).toBe(out);
  });

  it("雛形が想定と違うときは、debug 鍵のままにせず止める", () => {
    const changed = TEMPLATE.replace(
      /release \{\n(\s*\/\/[^\n]*\n)*\s*signingConfig signingConfigs\.debug/,
      "release {\n            signingConfig getDebugKey()",
    );
    expect(changed).not.toBe(TEMPLATE);
    expect(() => applyReleaseSigning(changed)).toThrow(/雛形が想定と違う/);
  });
});
