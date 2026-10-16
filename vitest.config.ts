import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./contracts", import.meta.url)),
      // アプリの通信クライアント（src/lib/api.ts）は expo/fetch を使う。Node のテストでは標準の fetch に置き換える
      "expo/fetch": fileURLToPath(new URL("./tests/stubs/expo-fetch.ts", import.meta.url)),
    },
  },
  // PGlite（手元の DB）は最初の起動に数秒かかり、全テストを並べて走らせると既定の 5 秒を超えることがある（リハーサル4）
  test: { include: ["tests/**/*.test.ts"], env: { MOCK: "1" }, testTimeout: 30_000 },
});
