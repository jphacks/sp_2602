// release 版を、誰でも持っている debug 鍵ではなく、自分たちの鍵（アップロード鍵）で署名させる config plugin。
//
// なぜ要るか:
// - prebuild が作る android/app/build.gradle は、release も signingConfig signingConfigs.debug（雛形の公開の debug.keystore）。
//   同じ鍵は誰でも持っているので、書き換えた APK で Slope を上書き更新でき、Device Owner の力もそのまま引き継がれてしまう。
// - android/ は prebuild の生成物なので、手で直さずにここで毎回書き換える。
//
// 鍵の場所とパスワードはリポジトリに入れない。次の4つを ~/.gradle/gradle.properties（または同じ名前の環境変数）から読む:
//   SLOPE_UPLOAD_STORE_FILE / SLOPE_UPLOAD_STORE_PASSWORD / SLOPE_UPLOAD_KEY_ALIAS / SLOPE_UPLOAD_KEY_PASSWORD
// 値が足りないまま release を作ろうとすると、debug 鍵に戻さずに止める（preReleaseBuild の前の slopeCheckReleaseSigning）。
// debug ビルドと dev client は今までどおり debug 鍵で動く。
// EAS Build（環境変数 EAS_BUILD=true）は EAS が credentials.json で signingConfigs.release を埋めるので、この確認を飛ばす。
// 手順は docs/release-signing.md。

import { type ConfigPlugin, withAppBuildGradle } from "expo/config-plugins";

const MARKER = "// @slope-release-signing";

// android { より前に置く。値を読むのと、足りないものの一覧づくりと、release の前に止める確認。
const PRELUDE = `${MARKER}（plugins/with-release-signing.ts が prebuild のたびに書く。手で直しても消える）
// release は自分たちの鍵で署名する。値は ~/.gradle/gradle.properties か環境変数から読む（docs/release-signing.md）
def slopeSigningNames = [
    'SLOPE_UPLOAD_STORE_FILE',
    'SLOPE_UPLOAD_STORE_PASSWORD',
    'SLOPE_UPLOAD_KEY_ALIAS',
    'SLOPE_UPLOAD_KEY_PASSWORD',
]
def slopeSigning = slopeSigningNames.collectEntries { name ->
    def value = findProperty(name) ?: System.getenv(name)
    [(name): value ? value.toString().trim() : null]
}
def slopeSigningProblems = slopeSigningNames.findAll { !slopeSigning[it] }.collect { "  - \${it} がありません" }
if (slopeSigning.SLOPE_UPLOAD_STORE_FILE && !file(slopeSigning.SLOPE_UPLOAD_STORE_FILE).isFile()) {
    slopeSigningProblems << "  - SLOPE_UPLOAD_STORE_FILE の鍵のファイルが見つかりません: \${file(slopeSigning.SLOPE_UPLOAD_STORE_FILE)}"
}
def slopeIsEasBuild = System.getenv('EAS_BUILD') == 'true'
def slopeUseReleaseKey = slopeSigningProblems.isEmpty()

def slopeCheckReleaseSigning = tasks.register('slopeCheckReleaseSigning') {
    group = 'verification'
    description = 'release を自分たちの鍵で署名できるかを確かめる（足りなければ止める）'
    def problems = slopeSigningProblems.collect { it.toString() }
    def skip = slopeIsEasBuild
    doLast {
        if (skip || problems.isEmpty()) {
            return
        }
        throw new GradleException(([
            '',
            'Slope: release 版を署名する鍵の設定が足りないので止めました（debug 鍵には戻しません）。',
            'release signing is not configured (SLOPE_UPLOAD_*). See docs/release-signing.md',
        ] + problems + [
            '',
            '~/.gradle/gradle.properties（Windows は %USERPROFILE%\\\\.gradle\\\\gradle.properties）に4つの値を書いてください。',
            '手順: docs/release-signing.md',
            'debug ビルドと dev client（npm run android）は、この設定がなくても動きます。',
        ]).join('\\n'))
    }
}
tasks.matching { it.name == 'preReleaseBuild' }.configureEach {
    dependsOn slopeCheckReleaseSigning
}

`;

const RELEASE_SIGNING_CONFIG = `
        release {
            ${MARKER}: 値がそろっているときだけ鍵を入れる（足りなければ slopeCheckReleaseSigning が release を止める）
            if (slopeUseReleaseKey) {
                storeFile file(slopeSigning.SLOPE_UPLOAD_STORE_FILE)
                storePassword slopeSigning.SLOPE_UPLOAD_STORE_PASSWORD
                keyAlias slopeSigning.SLOPE_UPLOAD_KEY_ALIAS
                keyPassword slopeSigning.SLOPE_UPLOAD_KEY_PASSWORD
            }
        }`;

// 雛形の debug の署名の設定（signingConfigs { debug { ... } } の閉じかっこまで）
const DEBUG_SIGNING_CONFIG = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
// 雛形の release の「Caution!」のコメントと、debug 鍵を使う行
const RELEASE_USES_DEBUG = /(release\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/;

export function applyReleaseSigning(gradle: string): string {
  if (gradle.includes(MARKER)) {
    return gradle;
  }
  if (!DEBUG_SIGNING_CONFIG.test(gradle) || !RELEASE_USES_DEBUG.test(gradle)) {
    // 雛形が変わって書き換えられないときは、黙って debug 鍵のままにせず prebuild を止める
    throw new Error(
      "with-release-signing: android/app/build.gradle の雛形が想定と違うため、release の署名を書き換えられません。plugins/with-release-signing.ts を雛形に合わせて直してください。",
    );
  }
  const androidBlock = gradle.indexOf("\nandroid {");
  if (androidBlock < 0) {
    throw new Error("with-release-signing: android/app/build.gradle に android { が見つかりません");
  }
  let out = `${gradle.slice(0, androidBlock + 1)}${PRELUDE}${gradle.slice(androidBlock + 1)}`;
  out = out.replace(DEBUG_SIGNING_CONFIG, `$1${RELEASE_SIGNING_CONFIG}`);
  out = out.replace(
    RELEASE_USES_DEBUG,
    `$1${MARKER}: debug 鍵（誰でも持っている雛形の鍵）では署名しない\n            signingConfig signingConfigs.release`,
  );
  return out;
}

const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error("with-release-signing: build.gradle が Groovy ではないため書き換えられません");
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

export default withReleaseSigning;
