// 確かめ役（V）のテストで共通に使う道具。サーバは Hono の app.request で、本物のネットワークを使わずに呼ぶ。
// 状態はメモリ上の store（src/server/mock/store.ts）。テストごとに時計を固定した新しい store に入れ替える。
// テストではない（ファイル名が *.test.ts でない）ので、vitest はこれを単体では走らせない。

import { ApiError } from "@contracts/errors";
import { mockSessions } from "@contracts/fixtures";
import { PairStatus, PairTicket, Session } from "@contracts/schemas";
import app from "@/server/app";
import { resetStore, type StoreOptions } from "@/server/mock/store";

export const PARENT = mockSessions["mock-google-parent"].token;
export const CHILD = mockSessions["mock-google-child"].token;
export const NEW = mockSessions["mock-google-new"].token;
export const CHILD_ID = mockSessions["mock-google-child"].userId;

// 時計。clock.set("2026-10-01T03:00:00Z") のように進める（日本時間は +9 時間）
export const clock = {
  ms: Date.parse("2026-10-15T03:00:00Z"),
  set(iso: string) {
    this.ms = Date.parse(iso);
  },
  addMs(n: number) {
    this.ms += n;
  },
};

// 新しい store にする（seed: デモの3人を入れるか）
export function fresh(nowIso: string, opts: Omit<StoreOptions, "now"> = {}) {
  clock.set(nowIso);
  return resetStore({ seed: true, ...opts, now: () => new Date(clock.ms) });
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
