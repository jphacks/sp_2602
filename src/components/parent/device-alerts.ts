// 保護者のホーム（親01）に出す「子どものスマホの注意」の帯の中身を決める（純粋な関数。tests/parent/device-alerts.test.ts。D-113）。
// 子どものスマホで許可がオフになった・子どものスマホから連絡が途絶えた、を保護者に知らせ、子どもの端末で直してもらう一言を添える。
// 画面の部品は DeviceAlertBanner.tsx。色は既存の帯（Banner）の tone で出し分ける（新しい色は足さない）:
//   連絡の途絶・使用時間へのアクセス・ユーザー補助 = danger、ほかのアプリの上に表示 = warning、通知 = info。
import { dateOf } from "@contracts/dates";
import type { ChildDeviceStatus } from "@contracts/schemas";
import type { BannerTone } from "../banner-tones";
import type { IconName } from "../Icon";
import { timeJst } from "./format";

export type DevicePermission = "usageAccess" | "overlay" | "notifications" | "accessibility";

// 子どもの端末の状態（contracts/schemas.ts の ChildDeviceStatus。permissions・offSince（オフになった時刻。オンなら null）・
// measuredAt（子どもの端末で測った時刻）・lastSeenAt（サーバに最後に届いた時刻））
export type DeviceStatusInput = ChildDeviceStatus;

export type DeviceAlert = {
  key: "unreachable" | DevicePermission;
  tone: Extract<BannerTone, "danger" | "warning" | "info">;
  icon: IconName;
  message: string; // 見出し（帯の太字）
  hint: string; // 何が困るか＋子どもの端末で直してもらう一言
};

// この時間（分）以上サーバに届いていなければ「連絡が取れていない」とする
export const UNREACHABLE_MINUTES = 30;

// 許可ごとの帯（並びは重い順 = この配列の順）
type PermissionAlertDef = {
  permission: DevicePermission;
  label: string; // Android の設定の名前（子01 の「見守りのための許可」と同じ呼び方）
  tone: DeviceAlert["tone"];
  icon: IconName;
  effect: string; // オフだと何が困るか
  fix: string; // 子どもの端末で直してもらう一言
};

const PERMISSION_ALERTS: readonly PermissionAlertDef[] = [
  {
    permission: "usageAccess",
    label: "使用時間へのアクセス",
    tone: "danger",
    icon: "clock",
    effect: "使用時間が分からないため、上限を守らせることができません。",
    fix: "子どものスマホの「設定」→「使用状況へのアクセス」で Slope をオンにしてもらってください。",
  },
  {
    permission: "overlay",
    label: "ほかのアプリの上に表示",
    tone: "warning",
    icon: "apps",
    effect: "時間が終わったときの案内が出にくくなります。",
    fix: "子どものスマホの「設定」→「ほかのアプリの上に表示」で Slope をオンにしてもらってください。",
  },
  {
    // Web サイトを1つも登録していなければ要らない許可なので出さない（D-111 で子01 も求めない）
    permission: "accessibility",
    label: "ユーザー補助",
    tone: "danger",
    icon: "language",
    effect: "登録した Web サイトの制限が効きません。",
    fix: "子どものスマホの「設定」→「ユーザー補助」で Slope をオンにしてもらってください。",
  },
  {
    // 案内は通知がなくても画面に出せるので、いちばん弱い（info）
    permission: "notifications",
    label: "通知",
    tone: "info",
    icon: "info",
    effect: "案内を通知で出せません。",
    fix: "子どものスマホの「設定」→「通知」で Slope をオンにしてもらってください。",
  },
];

// ISO の時刻 → 日本時間の「10:12」（今日なら）／「10月17日 10:12」（今日でなければ）。読めなければ null
export function alertTime(iso: string, now: Date): string | null {
  const ms = Date.parse(iso);
  const hm = timeJst(iso);
  if (Number.isNaN(ms) || hm == null) return null;
  const day = dateOf(new Date(ms));
  if (day === dateOf(now)) return hm;
  const [, m, d] = day.split("-").map(Number);
  return `${m}月${d}日 ${hm}`;
}

export function deviceAlerts(
  status: DeviceStatusInput | null,
  opts: { hasBlockedSites: boolean; now: Date },
): DeviceAlert[] {
  // まだ一度も届いていない（紐づけた直後・古い版の子どものアプリ）。分からないことは知らせない
  if (status == null) return [];
  const { now, hasBlockedSites } = opts;

  const lastSeenMs = Date.parse(status.lastSeenAt);
  if (!Number.isNaN(lastSeenMs) && now.getTime() - lastSeenMs >= UNREACHABLE_MINUTES * 60_000) {
    // 連絡が途絶えているときは、許可の帯は出さない（この1本だけ）。
    // なぜ: 許可の状態は最後に届いた時点のもので、今もそうかは分からない（その後に直したかもしれない・アプリごと消されたかもしれない）。
    //   古い情報で「オフになっています」と言い切ると、保護者が子どもに無駄な確認をさせてしまう。まず連絡が戻ることが先で、
    //   戻れば最新の許可の状態が届き、要るならそのとき許可の帯が出る
    const last = alertTime(status.lastSeenAt, now);
    return [
      {
        key: "unreachable",
        tone: "danger",
        icon: "cloud_off",
        message: `子どものスマホと${UNREACHABLE_MINUTES}分以上連絡が取れていません`,
        hint: `アプリが消された・電源が切れた・通信がない可能性があります。${last ? `最後の連絡: ${last}。` : ""}子どものスマホの電源と通信を確かめ、Slope を一度開いてもらってください。`,
      },
    ];
  }

  const alerts: DeviceAlert[] = [];
  for (const def of PERMISSION_ALERTS) {
    if (status.permissions[def.permission]) continue;
    if (def.permission === "accessibility" && !hasBlockedSites) continue;
    const since = status.offSince[def.permission];
    const at = since ? alertTime(since, now) : null;
    alerts.push({
      key: def.permission,
      tone: def.tone,
      icon: def.icon,
      message: `子どものスマホで「${def.label}」がオフになっています${at ? `（${at} から）` : ""}`,
      hint: `${def.effect}${def.fix}`,
    });
  }
  return alerts;
}

// 帯を決めるときの「今」。最後にサーバから状態を読めた時刻（checkedAt）より先には進めない。
// なぜ: 保護者のスマホが通信できない間も時計だけ進めると、子どものスマホは元気なのに「30分以上連絡が取れていません」と出てしまう
export function alertClock(now: Date, checkedAt: Date | null): Date {
  return checkedAt && checkedAt.getTime() < now.getTime() ? checkedAt : now;
}
