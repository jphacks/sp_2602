// MOCK の手元のサーバを立て直しても、ログイン・QR の紐づけ・設定・利用記録が残ること（src/server/mock/persist.ts）。
// 前は store がメモリの上だけで、立て直すと全部消えた。本物の Google でログインした2台は合言葉が無効になってログイン画面に戻り、
// 入り直すと別の人として作られるので、QR の紐づけを人の手でやり直す必要があった。
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api } from "@contracts/api";
import { LinkStatus, PairStatus, PairTicket, Session } from "@contracts/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/server/app";
import { enableMockPersistence, SAVE_DELAY_MS } from "@/server/mock/persist";
import { getStore, resetStore } from "@/server/mock/store";

let dir: string;
let file: string;
const quiet = { log: () => undefined };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "slope-mock-store-"));
  file = join(dir, "state", "mock-store.json");
  resetStore({ seed: true });
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(token ? auth(token) : {}) },
  });
const get = (path: string, token: string) => app.request(path, { headers: auth(token) });

async function signIn(idToken: string): Promise<Session> {
  return Session.parse(await (await post("/api/auth/google", { idToken })).json());
}

// 2人の「はじめての人」を QR で紐づけ、通常上限を決め、利用記録を1件送る
async function setupFamily() {
  const parent = await signIn("mock-new-parentA");
  const child = await signIn("mock-new-childA");
  const ticket = PairTicket.parse(await (await post("/api/pair/start", { name: "はなこ" }, child.token)).json());
  await post("/api/pair/claim", { code: ticket.code }, parent.token);
  const linked = PairStatus.parse(
    await (await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, child.token)).json(),
  );
  expect(linked.state).toBe("linked");
  const saved = api.usualLimitSave.res.parse(
    await (
      await post(
        "/api/plan/usual-limit",
        { childId: child.userId, expectedVersion: 0, usualLimitMinutes: 90 },
        parent.token,
      )
    ).json(),
  );
  const submissionId = crypto.randomUUID();
  const upload = {
    submissionId,
    childId: child.userId,
    days: [{ date: "2026-10-15", measuredAt: "2026-10-15T01:00:00.000Z", restrictedMinutes: 42, apps: [] }],
  };
  expect((await post("/api/usage/upload", upload, child.token)).status).toBe(200);
  return { parent, child, configVersion: saved.configVersion, upload };
}

describe("MOCK のサーバを立て直しても、データが残る", () => {
  it("書き出して立て直すと、同じ合言葉のまま・紐づけ・役割・設定の版・利用記録・送信 ID が残る", async () => {
    const persistence = enableMockPersistence(file, quiet);
    expect(persistence.restored).toBe(false);
    const { parent, child, configVersion, upload } = await setupFamily();
    persistence.saveNow();

    // 立て直し（プロセスが終わってメモリが空になった）
    resetStore({ seed: false });
    const again = enableMockPersistence(file, quiet);
    expect(again.restored).toBe(true);

    const me = Session.parse(await (await get("/api/auth/me", parent.token)).json());
    expect(me).toMatchObject({ userId: parent.userId, role: "parent" });
    const link = LinkStatus.parse(await (await get("/api/link/status", child.token)).json());
    expect(link).toMatchObject({ state: "linked", role: "child" });
    expect(link.partners).toEqual([{ userId: parent.userId, name: parent.name, role: "parent" }]);

    const config = api.configGet.res.parse(
      await (await post("/api/config/get", { childId: child.userId, knownVersion: configVersion }, child.token)).json(),
    );
    expect(config).toEqual({ changed: false, configVersion });

    // 同じ送信 ID の送り直しは、立て直した後も duplicate（二重に保存しない）
    const dup = api.usageUpload.res.parse(await (await post("/api/usage/upload", upload, child.token)).json());
    expect(dup.status).toBe("duplicate");
    const view = api.usageGet.res.parse(
      await (
        await post("/api/usage/get", { childId: child.userId, from: "2026-10-15", to: "2026-10-15" }, parent.token)
      ).json(),
    );
    expect(view.days[0]?.usedMinutes).toBe(42);
  });

  it("同じ人がログインし直すと、立て直した後も同じ人（同じ userId・役割）になる", async () => {
    const persistence = enableMockPersistence(file, quiet);
    const { parent } = await setupFamily();
    persistence.saveNow();
    resetStore({ seed: false });
    enableMockPersistence(file, quiet);
    const relogin = await signIn("mock-new-parentA");
    expect(relogin).toMatchObject({ userId: parent.userId, role: "parent" });
  });

  it("応答のあとの書き出しは少し待ってから1回にまとめる", async () => {
    vi.useFakeTimers();
    const persistence = enableMockPersistence(file, quiet);
    const before = readFileSync(file, "utf8");
    await signIn("mock-new-someone");
    persistence.scheduleSave();
    persistence.scheduleSave();
    expect(readFileSync(file, "utf8")).toBe(before); // まだ書いていない
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(readFileSync(file, "utf8")).not.toBe(before);
    expect(JSON.parse(readFileSync(file, "utf8")).users.some((u: { name: string }) => u.name.includes("eone"))).toBe(
      true,
    );
  });

  it("ファイルがなければ見本から始め、その中身を書き出す", () => {
    expect(existsSync(file)).toBe(false);
    const persistence = enableMockPersistence(file, quiet);
    expect(persistence.restored).toBe(false);
    expect(existsSync(file)).toBe(true);
    expect(getStore().dump().links).toHaveLength(1); // デモの保護者と子ども
  });

  it("読めないファイル・形の違うファイルは名前を変えて残し、見本から始める（サーバは止まらない）", () => {
    enableMockPersistence(file, quiet); // フォルダを作る
    for (const text of ["{壊れた", JSON.stringify({ format: 999, users: [] })]) {
      writeFileSync(file, text, "utf8");
      resetStore({ seed: true });
      const persistence = enableMockPersistence(file, quiet);
      expect(persistence.restored).toBe(false);
      expect(getStore().dump().links).toHaveLength(1);
    }
    const names = readdirSync(join(dir, "state"));
    expect(names.filter((n) => n.includes(".broken-"))).toHaveLength(2);
  });
});
