// 日別上限の作り足し（backend/src/db/c10-recalculate.ts の topUpDailyLimits）。
// 保存した日から LIMIT_HORIZON_DAYS 日先までしか作らないので、残りが LIMIT_TOPUP_MIN_DAYS 日を切ったら、
// 設定の取得（configGet）のときに今日から作り足し、設定の版を 1 上げる（子どもの端末は新しい版だけを取り込むため。C7）
import { addDays } from "@contracts/dates";
import type { ConfigResult, ConfigSnapshot } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { LIMIT_HORIZON_DAYS, LIMIT_TOPUP_MIN_DAYS } from "@/server/plan/daily-limits";
import { clock, fresh, newFamily, newPerson, ok, post, versionOf } from "../verify/helpers";

const snapshotOf = (r: ConfigResult): ConfigSnapshot => {
  if (!r.changed) throw new Error("changed: true のはず");
  return r.snapshot;
};
const configGet = (childId: string, token: string, knownVersion?: number) =>
  ok<ConfigResult>(
    post("/api/config/get", { childId, ...(knownVersion === undefined ? {} : { knownVersion }) }, token),
  );

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z");
});

describe("日別上限の作り足し", () => {
  it(`残りが ${LIMIT_TOPUP_MIN_DAYS} 日を切ったら、今日から ${LIMIT_HORIZON_DAYS} 日先まで作り足し、版を 1 上げる。前に作った日は変えない`, async () => {
    const { child, parent } = await newFamily("topup");
    await ok(
      post("/api/plan/usual-limit", { childId: child.userId, expectedVersion: 0, usualLimitMinutes: 90 }, parent.token),
    );
    const first = snapshotOf(await configGet(child.userId, child.token));
    expect(first.configVersion).toBe(1);
    expect(first.dailyLimits.at(-1)?.date).toBe(addDays("2026-10-15", LIMIT_HORIZON_DAYS));

    // 残りが十分なうち（59 日たっても残り 61 日）は作り足さない。
    // （合言葉は30日使わないと切れるので、20日ごとに取りに来る。子どもの端末は30秒ごとに取りに来る）
    for (const at of ["2026-11-04", "2026-11-24", "2026-12-13"]) {
      clock.set(`${at}T03:00:00Z`);
      expect(await configGet(child.userId, child.token, 1)).toEqual({ changed: false, configVersion: 1 });
    }

    // 70 日後（残り 50 日）: 作り足す
    clock.set("2026-12-24T03:00:00Z");
    const later = snapshotOf(await configGet(child.userId, child.token, 1));
    expect(later.configVersion).toBe(2);
    expect(later.dailyLimits.at(-1)?.date).toBe(addDays("2026-12-24", LIMIT_HORIZON_DAYS));
    // 前に作った日（昨日以前を含む）はそのまま残っている
    expect(later.dailyLimits.slice(0, first.dailyLimits.length)).toEqual(first.dailyLimits);
    // 親から見ても同じ版（反映済み／反映待ちの比べ方がずれない）。親の合言葉は日がたって切れたので、ログインし直す
    const parentAgain = await newPerson("p-topup");
    expect(parentAgain.userId).toBe(parent.userId);
    expect(await versionOf(child.userId, parentAgain.token)).toBe(2);
    // 続けて取りに来ても、もう作り足さない（版が上がり続けない）
    expect(await configGet(child.userId, child.token, 2)).toEqual({ changed: false, configVersion: 2 });
  });

  it("一度も日別上限を作っていない子ども（紐づけ直後）は作り足さない（版は 0 のまま・未設定）", async () => {
    const { child } = await newFamily("topup-none");
    clock.set("2026-11-04T03:00:00Z"); // 合言葉が切れない20日後
    const fresh0 = snapshotOf(await configGet(child.userId, child.token));
    expect(fresh0.configVersion).toBe(0);
    expect(fresh0.dailyLimits).toEqual([]);
  });
});
