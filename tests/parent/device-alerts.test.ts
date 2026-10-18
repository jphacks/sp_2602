// 保護者のホーム（親01）の「子どものスマホの注意」の帯の中身のテスト（src/components/parent/device-alerts.ts。D-113）。
import { type ColorName, palettes, type ThemeName } from "@contracts/tokens";
import { describe, expect, it } from "vitest";
import { bannerBg, bannerFg } from "@/components/banner-tones";
import {
  alertClock,
  alertTime,
  type DevicePermission,
  type DeviceStatusInput,
  deviceAlerts,
} from "@/components/parent/device-alerts";

// 今 = 日本時間 2026-10-18 14:00
const NOW = new Date("2026-10-18T05:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const allOn: Record<DevicePermission, boolean> = {
  usageAccess: true,
  overlay: true,
  notifications: true,
  accessibility: true,
};
const noneOff: Record<DevicePermission, string | null> = {
  usageAccess: null,
  overlay: null,
  notifications: null,
  accessibility: null,
};

// off に挙げた許可をオフにし、日本時間 10:12（今日）からオフだったことにする
function status(off: DevicePermission[] = [], lastSeenMinutesAgo = 1): DeviceStatusInput {
  const permissions = { ...allOn };
  const offSince = { ...noneOff };
  for (const p of off) {
    permissions[p] = false;
    offSince[p] = "2026-10-18T01:12:00Z";
  }
  return {
    permissions,
    offSince,
    measuredAt: minutesAgo(lastSeenMinutesAgo),
    lastSeenAt: minutesAgo(lastSeenMinutesAgo),
  };
}

const opts = { hasBlockedSites: true, now: NOW };

describe("deviceAlerts", () => {
  it("まだ一度も届いていない（null）なら何も出さない", () => {
    expect(deviceAlerts(null, opts)).toEqual([]);
  });

  it("全部オンで連絡も取れていれば何も出さない", () => {
    expect(deviceAlerts(status(), opts)).toEqual([]);
  });

  it("使用時間へのアクセスがオフ: danger・オフになった時刻・直してもらう一言", () => {
    const [a, ...rest] = deviceAlerts(status(["usageAccess"]), opts);
    expect(rest).toEqual([]);
    expect(a?.key).toBe("usageAccess");
    expect(a?.tone).toBe("danger");
    expect(a?.message).toBe("子どものスマホで「使用時間へのアクセス」がオフになっています（10:12 から）");
    expect(a?.hint).toContain("上限を守らせることができません");
    expect(a?.hint).toContain("Slope をオンにしてもらってください");
  });

  it("ほかのアプリの上に表示がオフ: warning", () => {
    const [a] = deviceAlerts(status(["overlay"]), opts);
    expect(a?.key).toBe("overlay");
    expect(a?.tone).toBe("warning");
    expect(a?.message).toContain("「ほかのアプリの上に表示」がオフ");
    expect(a?.hint).toContain("案内が出にくくなります");
  });

  it("通知がオフ: いちばん弱い info", () => {
    const [a] = deviceAlerts(status(["notifications"]), opts);
    expect(a?.key).toBe("notifications");
    expect(a?.tone).toBe("info");
    expect(a?.hint).toContain("通知で出せません");
  });

  it("ユーザー補助がオフ: Web サイトを登録していれば danger で出す", () => {
    const [a] = deviceAlerts(status(["accessibility"]), opts);
    expect(a?.key).toBe("accessibility");
    expect(a?.tone).toBe("danger");
    expect(a?.message).toBe("子どものスマホで「ユーザー補助」がオフになっています（10:12 から）");
    expect(a?.hint).toContain("「設定」→「ユーザー補助」で Slope をオンにしてもらってください");
  });

  it("ユーザー補助がオフでも、Web サイトを1つも登録していなければ出さない（要らない許可）", () => {
    expect(deviceAlerts(status(["accessibility"]), { ...opts, hasBlockedSites: false })).toEqual([]);
    // ほかの許可は登録の有無によらず出す
    const keys = deviceAlerts(status(["accessibility", "overlay"]), { ...opts, hasBlockedSites: false }).map(
      (a) => a.key,
    );
    expect(keys).toEqual(["overlay"]);
  });

  it("いくつもオフなら重い順（使用時間へのアクセス → ほかのアプリの上に表示 → ユーザー補助 → 通知）", () => {
    const keys = deviceAlerts(status(["notifications", "accessibility", "overlay", "usageAccess"]), opts).map(
      (a) => a.key,
    );
    expect(keys).toEqual(["usageAccess", "overlay", "accessibility", "notifications"]);
  });

  it("オフになった時刻が分からなければ、見出しに時刻を付けない", () => {
    const s = status(["overlay"]);
    s.offSince.overlay = null;
    expect(deviceAlerts(s, opts)[0]?.message).toBe("子どものスマホで「ほかのアプリの上に表示」がオフになっています");
  });

  it("最後の連絡から30分ちょうどなら「連絡が取れていません」の1本だけ（許可の帯は古い情報なので出さない）", () => {
    const alerts = deviceAlerts(status(["usageAccess", "overlay"], 30), opts);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.key).toBe("unreachable");
    expect(alerts[0]?.tone).toBe("danger");
    expect(alerts[0]?.message).toBe("子どものスマホと30分以上連絡が取れていません");
    // 30 分前 = 日本時間 13:30
    expect(alerts[0]?.hint).toContain(
      "アプリが消された・電源が切れた・通信がない可能性があります。最後の連絡: 13:30。",
    );
  });

  it("29分なら連絡は取れているとみなし、許可の帯を出す", () => {
    const keys = deviceAlerts(status(["overlay"], 29), opts).map((a) => a.key);
    expect(keys).toEqual(["overlay"]);
  });

  it("最後の連絡が前の日なら、日付つきで書く", () => {
    const s = { ...status(), lastSeenAt: "2026-10-17T14:59:00Z" }; // 日本時間 10/17 23:59
    expect(deviceAlerts(s, opts)[0]?.hint).toContain("最後の連絡: 10月17日 23:59。");
  });
});

describe("alertTime（日本時間の HH:mm。今日でなければ M月D日 HH:mm）", () => {
  it("日本時間で今日なら時刻だけ", () => {
    expect(alertTime("2026-10-18T01:12:00Z", NOW)).toBe("10:12");
  });
  it("日本時間の 0:00 で日付が変わる（UTC では前の日でも今日）", () => {
    expect(alertTime("2026-10-17T15:00:00Z", NOW)).toBe("00:00");
    expect(alertTime("2026-10-17T14:59:00Z", NOW)).toBe("10月17日 23:59");
  });
  it("月の頭の 0 を付けない", () => {
    expect(alertTime("2026-09-05T00:07:00Z", NOW)).toBe("9月5日 09:07");
  });
  it("読めない時刻は null", () => {
    expect(alertTime("きのう", NOW)).toBeNull();
  });
});

// 白色・黒色のどちらのテーマでも、帯の文字（tone の文字色）が帯の地の上で読めること（WCAG 4.5 以上。tests/lib/theme-contrast.test.ts と同じ計り方）
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("帯の tone と色（新しい色は足さず、palettes の danger・warning・primary の組だけ）", () => {
  const all = deviceAlerts(status(["usageAccess", "overlay", "accessibility", "notifications"]), opts);
  const unreachable = deviceAlerts(status([], 31), opts);
  const toneOf = Object.fromEntries([...all, ...unreachable].map((a) => [a.key, a.tone]));

  it("対応表: 連絡の途絶・使用時間へのアクセス・ユーザー補助 = danger、ほかのアプリの上に表示 = warning、通知 = info", () => {
    expect(toneOf).toEqual({
      unreachable: "danger",
      usageAccess: "danger",
      accessibility: "danger",
      overlay: "warning",
      notifications: "info",
    });
  });

  it("使う色は palettes にある danger/dangerSoft・warning/warningSoft・onPrimarySoft/primarySoft だけ", () => {
    const used = new Set<ColorName>([...all, ...unreachable].flatMap((a) => [bannerFg[a.tone], bannerBg[a.tone]]));
    expect([...used].sort()).toEqual(
      ["danger", "dangerSoft", "onPrimarySoft", "primarySoft", "warning", "warningSoft"].sort(),
    );
  });

  describe.each(Object.keys(palettes) as ThemeName[])("テーマ %s", (theme) => {
    const c = palettes[theme];
    it.each(["danger", "warning", "info"] as const)("tone %s の帯の文字が地の上で読める", (tone) => {
      expect(contrast(c[bannerFg[tone]], c[bannerBg[tone]])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe("alertClock（保護者のスマホが通信できないときに途絶と言わない）", () => {
  it("最後に読めた時刻より先には進めない。まだ読めていなければ今", () => {
    const now = new Date("2026-10-18T03:00:00Z");
    const checked = new Date("2026-10-18T02:10:00Z");
    expect(alertClock(now, checked)).toBe(checked);
    expect(alertClock(now, null)).toBe(now);
    // 読めた時刻が今より後（時計のずれ）でも今を使う
    expect(alertClock(checked, now)).toBe(checked);
  });

  it("50分前に読めたきりなら、その時点で lastSeenAt から30分たっていない限り途絶の帯は出さない", () => {
    const lastSeen = "2026-10-18T02:00:00Z";
    const checked = new Date("2026-10-18T02:10:00Z"); // ここで通信が切れた
    const now = new Date("2026-10-18T03:00:00Z");
    const status = {
      permissions: { usageAccess: true, overlay: true, notifications: true, accessibility: true },
      offSince: { usageAccess: null, overlay: null, notifications: null, accessibility: null },
      measuredAt: lastSeen,
      lastSeenAt: lastSeen,
    };
    expect(deviceAlerts(status, { hasBlockedSites: false, now: alertClock(now, checked) })).toEqual([]);
    expect(deviceAlerts(status, { hasBlockedSites: false, now }).length).toBe(1);
  });
});
