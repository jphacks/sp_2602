// 保護者のホーム（親01）の「子どものスマホの注意」の帯（D-113。Figma にない。親01 のほかの帯と同じ Banner を縦に並べる）。
// 子どものスマホで許可がオフになった・連絡が途絶えたことを知らせる。中身の決め方は device-alerts.ts（純粋な関数）。
//   <DeviceAlertBanner status={status} checkedAt={checkedAt} hasBlockedSites={snapshot.blockedSites.length > 0} />
// 何も知らせることがなければ何も描かない（null）。色は Banner の tone（白色・黒色のテーマに合わせて Banner が引く）。
import { tokens } from "@contracts/tokens";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner } from "../Banner";
import { alertClock, type DeviceStatusInput, deviceAlerts } from "./device-alerts";

// 「30分以上連絡が取れていません」を、新しい状態が届かなくても時間がたてば出すため、1分ごとに描き直す
const TICK_MS = 60_000;

// checkedAt: 最後にサーバから状態を読めた時刻（useDeviceStatus）。連絡の途絶はこの時刻までで判断する
//   （保護者のスマホが通信できない間は時刻が進まないので、子どものスマホと連絡が取れないと誤って言わない）
type Props = { status: DeviceStatusInput | null; checkedAt: Date | null; hasBlockedSites: boolean };

export function DeviceAlertBanner({ status, checkedAt, hasBlockedSites }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const alerts = deviceAlerts(status, { hasBlockedSites, now: alertClock(now, checkedAt) });
  if (alerts.length === 0) return null;
  return (
    <View style={styles.list}>
      {alerts.map((a) => (
        <Banner key={a.key} tone={a.tone} icon={a.icon} message={a.message} hint={a.hint} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.space[3] },
});
