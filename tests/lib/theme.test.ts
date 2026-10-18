// テーマカラー（白色 = light / 黒色 = dark / ベージュ = notebook。ノートは子ども用の見た目だけ）のテスト（contracts/tokens.ts の palettes・src/lib/theme-store.ts）。
// 色の組がライト・ダークで同じ名前を全部持っていること（ダークに抜けがあると、その部品だけ色が付かない）、
// 選んだテーマを端末に保存して読み戻せること、壊れた保存でも落ちずにライトになること、ログアウトでは消えないことを確かめる。
import { type ColorName, palettes, type ThemeName } from "@contracts/tokens";
import { describe, expect, it } from "vitest";
import { createAppIconCache } from "@/lib/app-icons";
import { createChildAppsSync } from "@/lib/child-apps-sync";
import { createConfigCache } from "@/lib/config-cache";
import { clearLocalDataFor } from "@/lib/sign-out";
import { clearSessionData, type KeyValueStorage, storageKeys } from "@/lib/storage";
import {
  classicThemeName,
  DEFAULT_THEME,
  KIDS_THEME_OPTIONS,
  kidsThemeLabel,
  loadThemeName,
  saveThemeName,
  statusBarStyle,
  THEME_OPTIONS,
  themeLabel,
} from "@/lib/theme-store";
import { createUsageOutbox } from "@/lib/usage-outbox";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

const themes: ThemeName[] = ["light", "dark"];
const names = (t: ThemeName) => Object.keys(palettes[t]).sort();
// "#RRGGBB" か "rgba(r, g, b, a)"（React Native がそのまま読める形）
const colorPattern = /^(#[0-9A-F]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/;

describe("色の組（contracts/tokens.ts の palettes）", () => {
  it("ライトとダークは同じ名前を全部持つ（どちらにも抜け・余分がない）", () => {
    expect(names("dark")).toEqual(names("light"));
    expect(names("light").length).toBeGreaterThan(0);
  });

  it("どの色も React Native が読める形（#RRGGBB か rgba(…)）で、空でない", () => {
    for (const t of themes) {
      for (const [name, value] of Object.entries(palettes[t])) {
        expect(value, `${t}.${name}`).toMatch(colorPattern);
      }
    }
  });

  it("ダークは地と文字が暗い・明るいで入れ替わる（Figma ダーク: 背景 #121316・文字 #E4E2E6）", () => {
    // 明るさ（0〜255 の平均）でくらべる
    const lightness = (hex: string) =>
      (Number.parseInt(hex.slice(1, 3), 16) +
        Number.parseInt(hex.slice(3, 5), 16) +
        Number.parseInt(hex.slice(5, 7), 16)) /
      3;
    const darkerThan = (a: ColorName, b: ColorName, t: ThemeName) =>
      lightness(palettes[t][a]) < lightness(palettes[t][b]);
    expect(darkerThan("text", "bg", "light")).toBe(true);
    expect(darkerThan("bg", "text", "dark")).toBe(true);
    expect(darkerThan("bg", "surface", "dark")).toBe(true); // カードは背景より少し明るい
    expect(palettes.dark.bg).toBe("#121316");
    expect(palettes.dark.text).toBe("#E4E2E6");
  });

  it("QR はダークでも白地に黒の点のまま（読み取りのため）", () => {
    for (const t of themes) {
      expect(palettes[t].qrBg).toBe("#FFFFFF");
      expect(palettes[t].qrFg).toBe(palettes.light.qrFg);
    }
  });

  it("主ボタン・進捗バーの青（primaryFill）はダークでもライトと同じ。文字の青（primary）はダークでは明るい青", () => {
    expect(palettes.dark.primaryFill).toBe(palettes.light.primaryFill);
    expect(palettes.light.primary).toBe("#3B5BDB");
    expect(palettes.dark.primary).toBe("#AEBDFF");
  });
});

describe("テーマの選択肢と文言（theme-store.ts）", () => {
  it("保護者の選択肢は「白色」（ライト）「黒色」（ダーク）の2つ。どちらも色の組がある", () => {
    expect(THEME_OPTIONS.map((o) => [o.name, o.label])).toEqual([
      ["light", "白色"],
      ["dark", "黒色"],
    ]);
    for (const o of THEME_OPTIONS) expect(palettes[o.name]).toBeDefined();
  });

  it("子ども用の選択肢は3つ（Figma 子06 の白色・黒色・ベージュ）で、保存する名前を全部持つ", () => {
    expect(KIDS_THEME_OPTIONS.map((o) => [o.name, o.label, o.short])).toEqual([
      ["light", "白色（ホワイトボード）", "白色"],
      ["dark", "黒色（黒板）", "黒色"],
      ["notebook", "ベージュ（ノート）", "ベージュ"],
    ]);
    expect(KIDS_THEME_OPTIONS.map((o) => o.name).sort()).toEqual(Object.keys(palettes).sort());
  });

  it("保護者の今の見た目では、ノートはライトとして描く（色の組も一覧の値も白色）", () => {
    expect(classicThemeName("notebook")).toBe("light");
    expect(classicThemeName("light")).toBe("light");
    expect(classicThemeName("dark")).toBe("dark");
    expect(palettes.notebook).toBe(palettes.light);
  });

  it("設定の一覧の値は、ライトなら「白色」、ダークなら「黒色」（保護者はノートも「白色」）", () => {
    expect(themeLabel("light")).toBe("白色");
    expect(themeLabel("dark")).toBe("黒色");
    expect(themeLabel("notebook")).toBe("白色");
  });

  it("子ども用の設定の一覧の値は「白色」「黒色」「ベージュ」（Figma 子07）", () => {
    expect(kidsThemeLabel("light")).toBe("白色");
    expect(kidsThemeLabel("dark")).toBe("黒色");
    expect(kidsThemeLabel("notebook")).toBe("ベージュ");
  });

  it("既定はライト（白色）", () => {
    expect(DEFAULT_THEME).toBe("light");
  });

  it("ステータスバーの文字は、ダークでは明るく（light）、ライトでは暗く（dark）", () => {
    expect(statusBarStyle("dark")).toBe("light");
    expect(statusBarStyle("light")).toBe("dark");
    expect(statusBarStyle("notebook")).toBe("dark"); // ノートはクリームの紙（明るい地）
  });
});

describe("テーマの保存と読み込み（theme-store.ts）", () => {
  it("何も保存していなければライト", async () => {
    expect(await loadThemeName(memoryStorage())).toBe("light");
  });

  it("黒色を選んで保存すると、次に読んだとき（次の起動）も黒色。白色に戻せばまた白色", async () => {
    const storage = memoryStorage();
    await saveThemeName("dark", storage);
    expect(await loadThemeName(storage)).toBe("dark");
    expect(storage.data.has(storageKeys.theme)).toBe(true);
    await saveThemeName("light", storage);
    expect(await loadThemeName(storage)).toBe("light");
  });

  it("ベージュ（ノート）も保存して読み戻せる（子ども用の見た目で選んだもの）", async () => {
    const storage = memoryStorage();
    await saveThemeName("notebook", storage);
    expect(await loadThemeName(storage)).toBe("notebook");
  });

  it("保存が壊れている・知らない値のときは落ちずにライト", async () => {
    for (const raw of ["{壊れた", '"blue"', "123", "null", '{"name":"dark"}']) {
      const storage = memoryStorage();
      storage.data.set(storageKeys.theme, raw);
      expect(await loadThemeName(storage), raw).toBe("light");
    }
  });

  it("端末から読めない（例外）ときも落ちずにライト", async () => {
    const broken: KeyValueStorage = {
      getItem: async () => {
        throw new Error("storage broken");
      },
      setItem: async () => {},
      removeItem: async () => {},
    };
    expect(await loadThemeName(broken)).toBe("light");
  });

  it("ログアウト（合言葉・設定のキャッシュ・送信待ちを消す）でも、選んだテーマは消えない（端末の好み）", async () => {
    const storage = memoryStorage();
    await saveThemeName("dark", storage);
    const configCache = createConfigCache({
      storage,
      fetchConfig: async () => {
        throw new Error("offline");
      },
    });
    const usageOutbox = createUsageOutbox({
      storage,
      send: async () => {
        throw new Error("offline");
      },
    });

    await clearSessionData(storage);
    const childAppsSync = createChildAppsSync({
      storage,
      upload: async () => ({ iconsNeeded: [] }),
      uploadIcons: async () => ({}),
      epoch: async () => null,
    });
    const appIcons = createAppIconCache({ fetchList: async () => ({ apps: [] }), fetchIcons: async () => [] });
    await clearLocalDataFor("child-a", { configCache, usageOutbox, childAppsSync, appIcons });

    expect(await loadThemeName(storage)).toBe("dark");
  });
});
