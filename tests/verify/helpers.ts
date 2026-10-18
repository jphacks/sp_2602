// 確かめ役（V）のテストで共通に使う道具。サーバは Hono の app.request で、本物のネットワークを使わずに呼ぶ。
// 状態は手元の DB（PGlite）。テストごとに空にして見本を入れ直し、時計（Date）を固定する。
// テストではない（ファイル名が *.test.ts でない）ので、vitest はこれを単体では走らせない。

import { ApiError } from "@contracts/errors";
import { mockSessions } from "@contracts/fixtures";
import { PairStatus, PairTicket, Session } from "@contracts/schemas";
import { vi } from "vitest";
import app from "@/server/app";
import { resetDatabaseForTests } from "@/server/db";

export const PARENT = mockSessions["mock-google-parent"].token;
export const CHILD = mockSessions["mock-google-child"].token;
export const NEW = mockSessions["mock-google-new"].token;
export const CHILD_ID = mockSessions["mock-google-child"].userId;

// 時計。clock.set("2026-10-01T03:00:00Z") のように進める（日本時間は +9 時間）。
// サーバ（DB の保存処理も含む）は new Date() で時刻を読むので、Date だけを偽の時計にして、ここで動かす
export const clock = {
  ms: Date.parse("2026-10-15T03:00:00Z"),
  set(iso: string) {
    this.ms = Date.parse(iso);
    vi.setSystemTime(this.ms);
  },
  addMs(n: number) {
    this.ms += n;
    vi.setSystemTime(this.ms);
  },
};

// DB を空にして、時計を nowIso に合わせる（seed: デモの3人と見本を入れるか。既定は入れる）
export async function fresh(nowIso: string, opts: { seed?: boolean } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock.set(nowIso);
  return resetDatabaseForTests({ seed: opts.seed ?? true });
}

const auth = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export const post = async (path: string, body: unknown, token: string | null): Promise<Response> =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...auth(token) },
  });

export const postRaw = async (path: string, raw: string, token: string | null): Promise<Response> =>
  app.request(path, { method: "POST", body: raw, headers: { "Content-Type": "application/json", ...auth(token) } });

export const get = async (path: string, token: string | null): Promise<Response> =>
  app.request(path, { headers: auth(token) });

export const codeOf = async (res: Response) => ApiError.parse(await res.json()).code;

// 成功の応答の本文（200 でなければ本文つきで失敗させる）
export async function ok<T = unknown>(res: Response | Promise<Response>): Promise<T> {
  const r = await res;
  const body = await r.json();
  if (r.status !== 200) throw new Error(`200 のはずが ${r.status}: ${JSON.stringify(body)}`);
  return body as T;
}

// MOCK のログインで「はじめての人」を作る
export async function newPerson(suffix: string): Promise<Session> {
  const res = await post("/api/auth/google", { idToken: `mock-new-${suffix}` }, null);
  return Session.parse(await res.json());
}

// childToken が QR を出し、parentToken が読み、子どもが「はい」で確定する
export async function link(childToken: string, parentToken: string) {
  const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, childToken)));
  await ok(post("/api/pair/claim", { code: ticket.code }, parentToken));
  const confirmed = PairStatus.parse(
    await ok(post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, childToken)),
  );
  return { ticket, confirmed };
}

// 新しい親子を作って紐づける
export async function newFamily(tag: string) {
  const child = await newPerson(`c-${tag}`);
  const parent = await newPerson(`p-${tag}`);
  await link(child.token, parent.token);
  return { child, parent };
}

// 今の設定の版（親の planGet から）
export async function versionOf(childId: string, token: string): Promise<number> {
  return (await ok<{ configVersion: number }>(post("/api/plan/get", { childId }, token))).configVersion;
}
