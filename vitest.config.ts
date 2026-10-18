import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 同時に走らせるテストのファイルの数。CPU の数の 3 割（2〜6）にする。
// なぜ: DB（PGlite）を使うファイルは、それぞれ自分の DB を開いて重い処理を1本の CPU で続ける。既定（CPU の数 − 1。
//   この PC では 19）で全部を同時に始めると、ほかの作業で CPU が混んでいるときに最初のテストが 30 秒の時間切れになった
//   （2026-10-18。6 なら同じ混み方でも最長 9 秒ほど）。DB を使わないファイルは軽いので、絞っても全体は少し延びるだけ。
//   一時的に変えたいときは `npx vitest run --maxWorkers=…` か環境変数 VITEST_MAX_WORKERS。
const maxWorkers = Math.min(6, Math.max(2, Math.round(availableParallelism() * 0.3)));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./contracts", import.meta.url)),
      // アプリの通信クライアント（src/lib/api.ts）は expo/fetch を使う。Node のテストでは標準の fetch に置き換える
      "expo/fetch": fileURLToPath(new URL("./tests/stubs/expo-fetch.ts", import.meta.url)),
      // 端末の保存（src/lib/storage.ts）は AsyncStorage を使う。Node のテストではメモリ上の代わりに置き換える
      "@react-native-async-storage/async-storage": fileURLToPath(
        new URL("./tests/stubs/async-storage.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: { MOCK: "1" },
    // マイグレーション済みの DB（PGlite）を1回だけ作り、DB を使うテストのファイルはその写しから開く（理由はそのファイルの頭）
    globalSetup: ["tests/setup/pglite-template.ts"],
    maxWorkers,
    // PGlite（手元の DB）は最初の起動に数秒かかり、全テストを並べて走らせると既定の 5 秒を超えることがある（リハーサル4）
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
