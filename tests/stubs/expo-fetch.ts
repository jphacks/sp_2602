// テスト用の expo/fetch の代わり。呼ばれた時点の globalThis.fetch に渡す（テストごとに vi.stubGlobal("fetch", …) で差し替えられるように）。
export const fetch = (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args);
