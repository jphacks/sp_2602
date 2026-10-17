// 本文の大きさの上限（src/server/app.ts の MAX_BODY_BYTES）。
// 回帰: 前は上限がなく、合言葉なしで呼べる authGoogle に数百 MB の本文を送ると、サーバがそれを全部メモリに読み込んでいた。
import { api } from "@contracts/api";
import { ApiError } from "@contracts/errors";
import { mockSessions } from "@contracts/fixtures";
import { UsageUpload } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import app, { MAX_BODY_BYTES } from "@/server/app";
import { resetStore } from "@/server/mock/store";

const CHILD = mockSessions["mock-google-child"].token;
const CHILD_ID = mockSessions["mock-google-child"].userId;

beforeEach(() => {
  resetStore({ seed: true, now: () => new Date("2026-10-15T03:00:00Z") });
});

describe("本文の大きさの上限", () => {
  it("上限を超える本文は、読み込む前に 400 bad_request（利用者向けの文）", async () => {
    const res = await app.request("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: "x".repeat(MAX_BODY_BYTES + 1) }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = ApiError.parse(await res.json());
    expect(body).toMatchObject({ code: "bad_request", message: "送る内容が大きすぎます" });
  });

  it("Content-Length が上限を超えると申告された本文も断る", async () => {
    const res = await app.request("/api/auth/google", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json", "Content-Length": String(MAX_BODY_BYTES + 1) },
    });
    expect(res.status).toBe(400);
  });

  it("契約で一番大きくなりうる利用記録（7日 × 1000 アプリ・長い名前）は上限の内で、受け付ける", async () => {
    const label = "あ".repeat(120); // UTF-8 で 360 バイト
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(9 + i).padStart(2, "0")}`,
      measuredAt: "2026-10-15T02:00:00.000Z",
      restrictedMinutes: 1440,
      apps: Array.from({ length: 1000 }, (_, j) => ({
        packageName: `${String(j).padStart(4, "0")}${"p".repeat(251)}`,
        label,
        usedMinutes: 1440,
        excluded: false,
      })),
    }));
    const upload = UsageUpload.parse({ submissionId: crypto.randomUUID(), childId: CHILD_ID, days });
    const text = JSON.stringify(upload);
    expect(new TextEncoder().encode(text).length).toBeLessThan(MAX_BODY_BYTES);
    const res = await app.request("/api/usage/upload", {
      method: "POST",
      body: text,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHILD}` },
    });
    expect(res.status).toBe(200);
    expect(api.usageUpload.res.parse(await res.json()).status).toBe("accepted");
  });
});
