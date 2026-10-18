// 端末の中の値（ログインの合言葉など）を、Google ドライブのバックアップや機種変更の引き継ぎに入れないための config plugin。
//
// なぜ要るか:
// - 合言葉は AsyncStorage（databases/ の RKStorage）と、Kotlin 側の SharedPreferences "slope_engine" に平文で入っている。
//   バックアップに入ると、別の端末に戻したときにそのまま使えてしまう。
// - app.json の android.allowBackup=false で Google ドライブへのバックアップ（Android 11 以前は adb backup も）は止まる。
//   ただし Android 12 以降を対象にしたアプリでは、機種によっては allowBackup=false でも端末間の引き継ぎ（D2D）が止まらない
//   （https://developer.android.com/about/versions/12/behavior-changes-12 の「D2D transfer functionality changes」）。
//   そこで android:dataExtractionRules で、クラウドのバックアップ・端末間の引き継ぎの両方から、全部の置き場を外す。
// - android/ は prebuild の生成物なので、手で直さずにここで毎回書き込む。

import fs from "node:fs";
import path from "node:path";
import { type ConfigPlugin, withAndroidManifest, withDangerousMod } from "expo/config-plugins";

const RULES_NAME = "slope_data_extraction_rules";

// Android の「アプリの置き場」の区分を全部並べる（path="." はその区分の全部）。
// device_* は、端末のロックを解く前から読める置き場（Device Protected Storage）。
const DOMAINS = [
  "root",
  "file",
  "database",
  "sharedpref",
  "external",
  "device_root",
  "device_file",
  "device_database",
  "device_sharedpref",
];

function excludeAll(indent: string): string {
  return DOMAINS.map((domain) => `${indent}<exclude domain="${domain}" path="." />`).join("\n");
}

const RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- with-android-no-backup.ts が prebuild のたびに書く。ここを手で直しても消える。 -->
<data-extraction-rules>
  <cloud-backup>
${excludeAll("    ")}
  </cloud-backup>
  <device-transfer>
${excludeAll("    ")}
  </device-transfer>
</data-extraction-rules>
`;

const withAndroidNoBackup: ConfigPlugin = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) {
      throw new Error("with-android-no-backup: AndroidManifest.xml に <application> が見つかりません");
    }
    // app.json の android.allowBackup=false と同じ値を、念のためここでも入れる（app.json から消されても穴が戻らないように）
    app.$["android:allowBackup"] = "false";
    app.$["android:dataExtractionRules"] = `@xml/${RULES_NAME}`;
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${RULES_NAME}.xml`), RULES_XML, "utf8");
      return cfg;
    },
  ]);

  return config;
};

export default withAndroidNoBackup;
