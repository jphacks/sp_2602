// C8 回帰: 端末の時計が先に進んでいた（子どもが日時を変えた・時計のずれ）記録が、その日の記録として居座らないこと。
// 前は measuredAt が未来（例 2099 年）の記録を受け付けると、その日は「一番新しい測定」のままになり、時計を戻した後の
// 正しい記録が何度届いても古いとみなされ（appliedDates: []）、親の画面の分数が二度と更新されなかった。
import { api } from "@contracts/api";
import { mockSessions } from "@contracts/fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import app from "@/server/app";
import { resetStore } from "@/server/mock/store";

const PARENT = mockSessions["mock-google-parent"].token;
const CHILD = mockSessions["mock-google-child"].token;
const CHILD_ID = mockSessions["mock-google-child"].userId;

// 日本時間 2026-10-15 12:00
let nowMs = Date.parse("2026-10-15T03:00:00Z");
const TODAY = "2026-10-15";

beforeEach(() => {
  nowMs = Date.parse("2026-10-15T03:00:00Z");
  resetStore({ seed: true, now: () => new Date(nowMs) });
});

const post = (path: string, body: unknown, token: string) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });

const upload = async (measuredAt: string, minutes: number) =>
  api.usageUpload.res.parse(
    await (
      await post(
        "/api/usage/upload",
        {
          submissionId: crypto.randomUUID(),
          childId: CHILD_ID,
          days: [{ date: TODAY, measuredAt, restrictedMinutes: minutes, apps: [] }],
        },
        CHILD,
      )
    ).json(),
  );

const todayView = async () =>
  api.usageGet.res.parse(
    await (await post("/api/usage/get", { childId: CHILD_ID, from: TODAY, to: TODAY }, PARENT)).json(),
  ).days[0];

describe("C8: 未来の測定時刻の記録", () => {
  it("未来の measuredAt の記録は受け付けるが、測定時刻はサーバの今として残す", async () => {
    const r = await upload("2099-01-01T00:00:00.000Z", 10);
    expect(r.appliedDates).toEqual([TODAY]);
    expect(await todayView()).toMatchObject({ usedMinutes: 10, measuredAt: "2026-10-15T03:00:00.000Z" });
  });

  it("未来の記録の後でも、時計を戻した後の正しい記録で、その日の記録が更新される", async () => {
    await upload("2099-01-01T00:00:00.000Z", 10);
    nowMs += 60_000;
    const r = await upload(new Date(nowMs).toISOString(), 30);
    expect(r.appliedDates).toEqual([TODAY]);
    expect((await todayView())?.usedMinutes).toBe(30);
  });

  it("今より前の測定は今までどおり（古い記録は新しい記録を上書きしない）", async () => {
    await upload("2026-10-15T02:59:00.000Z", 20);
    const old = await upload("2026-10-15T02:00:00.000Z", 5);
    expect(old.appliedDates).toEqual([]);
    expect(await todayView()).toMatchObject({ usedMinutes: 20, measuredAt: "2026-10-15T02:59:00.000Z" });
  });
});
