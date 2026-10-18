// C1 のログイン・合言葉・QR の紐づけと、親子のつながり（D2）。保存先は DB だけ（Vercel は Neon、手元・テストは PGlite）。
// MOCK=1 でも同じ処理を通る（違うのは、"mock-" のログインを受け付けることと、DB に見本が入っていることだけ。src/server/seed/demo.ts）。
// 決まりごと（docs/decisions.md）:
//   - 合言葉は推測できない乱数。DB にはハッシュだけを残す。最後に使ってから30日で無効（D-1）。ログアウトで無効（authSignOut）
//   - 合言葉を無効にするときは、理由（revoked_reason）も残す。保護者が連携を外して無効にした合言葉で呼ばれたときだけ、
//     401 に理由（family_unlink）を付ける（子どもの端末が「連携が外れた」と分かって制限を止められるように。D-133）
//   - QR は10分・1回だけ・出し直したら前の QR は無効（Q10）。番号は16進40文字の乱数（D-5）
//   - 保護者1人↔子ども1人（Q2）。読み取りのときと確定のときの両方で確かめる（D-7）
//   - QR の番号を10分に10回まちがえた人は、しばらく断る（総当たりを防ぐ。PR #47）
//   - id は uuid。uuid の形でない id は、DB に聞かずに「見つからない／扱えない」と答える（DB のエラーで 500 にしない）
//   - MOCK=1 でないサーバでは、MOCK のログインの人（デモの3人・はじめての人）の合言葉は 401（findSession。D-126）
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, inArray, isNotNull, isNull, lte, ne, notExists, or } from "drizzle-orm";
import { clearChildFamilyData, recordFamilyUnlink } from "../../backend/src/db/family-unlink.js";
import {
  authIdentities,
  childConfigVersions,
  familyLinks,
  pairClaimFailures,
  pairTickets,
  userSessions,
  users,
} from "../../backend/src/db/schema/index.js";
import type { AuthRule } from "../../contracts/api.js";
import { mockSessions } from "../../contracts/fixtures.js";
import type { LinkStatus, PairStatus, PairTicket, Session } from "../../contracts/schemas.js";
import { digest } from "./auth/digest.js";
import { type Db, db } from "./db/index.js";
import { isMock } from "./env.js";
import { AppError } from "./errors.js";

export type Caller = Session;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

// 合言葉の期限: 最後に使ってから30日（使うたびに延長。D-1）
export const SESSION_IDLE_MS = 30 * 86_400_000;
// 「最後に使った時刻」を書き直す間隔（呼ぶたびに DB へ書かないため。30日に対して1分の誤差は問題にならない）
const LAST_USED_WRITE_MS = 60_000;
// QR の有効期限は 10 分（Q10）
export const PAIR_TTL_MS = 10 * 60_000;
// QR の番号を送る回数の上限: 同じ人が PAIR_CLAIM_WINDOW_MS の間に PAIR_CLAIM_MAX_FAILURES 回まちがえたら、その間は rate_limited
export const PAIR_CLAIM_MAX_FAILURES = 10;
export const PAIR_CLAIM_WINDOW_MS = 10 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export function tokenOf(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return m?.[1]?.trim() || null;
}

const randomToken = () => randomBytes(32).toString("base64url");
const randomCode = () => randomBytes(20).toString("hex"); // 16進40文字（D-5）

// ── ログインと合言葉 ──

// 外のログイン（provider: "google" は Google の sub、"mock" は MOCK の idToken）の人に、新しい合言葉を出す。初めての人は登録する（role は null）
export async function signIn(provider: "google" | "mock", subject: string, name: string): Promise<Session> {
  const database = await db();
  const token = randomToken();
  const now = new Date();
  const session = await database.transaction(async (tx) => {
    const userId = await userIdFor(tx, provider, subject, name);
    await tx.insert(userSessions).values({ userId, tokenHash: digest(token), createdAt: now, lastUsedAt: now });
    return sessionUser(tx, userId);
  });
  return { ...session, token };
}

export const signInGoogle = (sub: string, name: string) => signIn("google", sub, name);

// MOCK のログイン。mockSessions にある idToken はデモの人（合言葉も固定）、ほかの "mock-xxx" はその番号の「はじめての人」
export async function signInMock(idToken: string): Promise<Session> {
  const fixed = mockSessions[idToken as keyof typeof mockSessions];
  if (!fixed) {
    const suffix = idToken.slice("mock-".length) || "anonymous";
    return signIn("mock", suffix, `はじめての人（${suffix.slice(-4)}）`);
  }
  const database = await db();
  const now = new Date();
  return database.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id: fixed.userId, role: fixed.role, displayName: fixed.name })
      .onConflictDoNothing({ target: users.id });
    await tx
      .insert(authIdentities)
      .values({ userId: fixed.userId, provider: "mock", subject: idToken })
      .onConflictDoNothing({ target: [authIdentities.provider, authIdentities.subject] });
    // ログアウトで無効にした固定の合言葉も、もう一度ログインすれば使えるようにする（デモの人は合言葉が固定のため）
    await tx
      .insert(userSessions)
      .values({ userId: fixed.userId, tokenHash: digest(fixed.token), createdAt: now, lastUsedAt: now })
      .onConflictDoUpdate({
        target: userSessions.tokenHash,
        set: { revokedAt: null, revokedReason: null, lastUsedAt: now },
      });
    return { ...(await sessionUser(tx, fixed.userId)), token: fixed.token };
  });
}

async function userIdFor(tx: Tx, provider: string, subject: string, name: string): Promise<string> {
  const where = and(eq(authIdentities.provider, provider), eq(authIdentities.subject, subject));
  const [identity] = await tx.select({ userId: authIdentities.userId }).from(authIdentities).where(where).limit(1);
  if (identity) {
    // QR の確定で子どもの呼び名を保存していることがある。名前が空のときだけ埋める
    await tx
      .update(users)
      .set({ displayName: name, updatedAt: new Date() })
      .where(and(eq(users.id, identity.userId), isNull(users.displayName)));
    return identity.userId;
  }
  const [created] = await tx.insert(users).values({ displayName: name }).returning({ id: users.id });
  if (!created) throw new AppError("internal");
  const [inserted] = await tx
    .insert(authIdentities)
    .values({ userId: created.id, provider, subject })
    .onConflictDoNothing({ target: [authIdentities.provider, authIdentities.subject] })
    .returning({ userId: authIdentities.userId });
  if (inserted) return inserted.userId;
  // 同じ人の初めてのログインが同時に2つ届き、もう一方が先に登録した
  await tx.delete(users).where(eq(users.id, created.id));
  const [winner] = await tx.select({ userId: authIdentities.userId }).from(authIdentities).where(where).limit(1);
  if (!winner) throw new AppError("internal");
  return winner.userId;
}

async function sessionUser(tx: Executor, userId: string): Promise<Omit<Session, "token">> {
  const [user] = await tx
    .select({ id: users.id, name: users.displayName, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError("internal");
  return { userId: user.id, name: user.name || "利用者", role: user.role };
}

// 合言葉がまだ使えるかだけを確かめる（authCheck。D-134）。DB は読むだけ（期限を延ばさない）。
// 使えなければ authorize と同じ 401（外された子どもの合言葉なら reason: family_unlink）
export async function checkToken(request: Request): Promise<void> {
  const token = tokenOf(request);
  const caller = token ? await findSession(token, { touch: false }) : null;
  if (!caller) throw token && (await wasUnlinked(token)) ? unlinkedError() : new AppError("unauthorized");
}

export async function authorize(rule: AuthRule, request: Request): Promise<Caller | null> {
  if (rule === "none") return null;
  const token = tokenOf(request);
  const caller = token ? await findSession(token) : null;
  if (!caller) throw token && (await wasUnlinked(token)) ? unlinkedError() : new AppError("unauthorized");
  if (rule === "parent" && caller.role !== "parent")
    throw new AppError("forbidden", "保護者だけができる操作です", "保護者の端末から操作してください");
  if (rule === "child" && caller.role !== "child")
    throw new AppError("forbidden", "子どもの端末だけが送れる情報です", "子どもの端末から送ってください");
  return caller;
}

// 合言葉から呼んだ人を探す。取り消した・30日使われていない合言葉は無効。使うたびに期限を延ばす。
// MOCK=1 でないサーバでは、MOCK のログイン（authIdentities の provider が "mock"）の人の合言葉は無効（401）。
// なぜ: デモの人の合言葉は固定で、公開リポジトリ（contracts/fixtures.ts）に平文で書いてある。前はハッシュの一致だけで
//   通していたので、MOCK=1 のサーバが一度でも DB に見本を入れると、MOCK を外した後もだれでもデモの人として入れた
//   （セキュリティ自己点検 🔴1）。MOCK=1 に戻せば、また使える（手元の開発・テスト）
// touch: false なら「最後に使った時刻」を書かない（authCheck。1分ごとに呼ばれても DB に書かず、合言葉の期限も延ばさない）
async function findSession(token: string, { touch = true }: { touch?: boolean } = {}): Promise<Session | null> {
  const database = await db();
  const now = new Date();
  const mockLogin = database
    .select({ id: authIdentities.id })
    .from(authIdentities)
    .where(and(eq(authIdentities.userId, users.id), eq(authIdentities.provider, "mock")));
  const [row] = await database
    .select({
      sessionId: userSessions.id,
      lastUsedAt: userSessions.lastUsedAt,
      userId: users.id,
      name: users.displayName,
      role: users.role,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, digest(token)),
        isNull(userSessions.revokedAt),
        or(isNull(userSessions.expiresAt), gt(userSessions.expiresAt, now)),
        isMock() ? undefined : notExists(mockLogin),
      ),
    )
    .limit(1);
  if (!row) return null;
  const idle = now.getTime() - row.lastUsedAt.getTime();
  if (idle > SESSION_IDLE_MS) return null;
  if (touch && idle >= LAST_USED_WRITE_MS)
    await database.update(userSessions).set({ lastUsedAt: now }).where(eq(userSessions.id, row.sessionId));
  return { token, userId: row.userId, name: row.name || "利用者", role: row.role };
}

// 合言葉を無効にした理由（user_sessions.revoked_reason。backend/src/db/schema/auth.ts）
type RevokeReason = "sign_out" | "sign_out_others" | "family_unlink";

// 保護者が連携を外したので使えなくなった合言葉か（無効にした合言葉のうち、理由が family_unlink のもの）。
// 期限切れ・知らない合言葉・ログアウトした合言葉は false（ふつうの 401 のまま）。
// 合言葉を知っている本人にしか返らないので、ほかの人に「この子どもは外された」が漏れることはない
async function wasUnlinked(token: string): Promise<boolean> {
  const database = await db();
  const [row] = await database
    .select({ reason: userSessions.revokedReason })
    .from(userSessions)
    .where(and(eq(userSessions.tokenHash, digest(token)), isNotNull(userSessions.revokedAt)))
    .limit(1);
  return row?.reason === "family_unlink";
}

// 連携が外れた子どもの端末への 401（code は unauthorized のまま。古いアプリは今までどおりログアウトするだけ）
const unlinkedError = () =>
  new AppError(
    "unauthorized",
    "保護者との連携が外れました",
    "また使うときは、ログインしてから保護者と QR でつなぎ直してください",
    "family_unlink",
  );

// ログアウト。otherDevices なら同じ人のほかの合言葉をすべて、そうでなければこの合言葉だけを使えなくする。使えなくした数を返す
export async function signOut(caller: Caller, otherDevices: boolean): Promise<{ revoked: number }> {
  const database = await db();
  const mine = digest(caller.token);
  const target = otherDevices
    ? and(eq(userSessions.userId, caller.userId), ne(userSessions.tokenHash, mine))
    : eq(userSessions.tokenHash, mine);
  const reason: RevokeReason = otherDevices ? "sign_out_others" : "sign_out";
  const rows = await database
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(target, isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  return { revoked: rows.length };
}

async function revokeAllSessions(tx: Tx, userId: string, reason: RevokeReason): Promise<number> {
  const rows = await tx
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  return rows.length;
}

// ── 子どもの範囲（route.ts が入力の childId を確かめる）──

export async function checkChildAccess(caller: Caller | null, input: unknown): Promise<void> {
  if (!caller) return;
  const childId = (input as { childId?: unknown } | null)?.childId;
  if (typeof childId !== "string") return;
  if (caller.role === "child") {
    if (childId !== caller.userId)
      throw new AppError("forbidden", "ほかの子どもの情報は扱えません", "自分の端末の情報だけを扱ってください");
    return;
  }
  if (caller.role === "parent") {
    if (!isUuid(childId) || !(await isLinked(await db(), caller.userId, childId)))
      throw new AppError("forbidden", "連携していない子どもの情報は扱えません", "QR で連携してから操作してください");
    return;
  }
  throw new AppError("forbidden", "まだ家族の連携が済んでいません", "QR で連携してから操作してください");
}

async function isLinked(tx: Executor, parentId: string, childId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: familyLinks.id })
    .from(familyLinks)
    .where(and(eq(familyLinks.parentId, parentId), eq(familyLinks.childId, childId)))
    .limit(1);
  return rows.length > 0;
}

// ── QR の紐づけ（C1）──

const oneToOne = () =>
  new AppError(
    "conflict",
    "すでにほかの家族と連携しています",
    "いまは保護者1人と子ども1人だけで連携できます（2人目は連携できません）",
  );
const expiredError = () =>
  new AppError("conflict", "この QR コードは期限が切れています", "子どもの端末で QR を出し直してください");
const alreadyUsedError = () =>
  new AppError("conflict", "この QR コードはもう使われています", "子どもの端末で QR を出し直してください");
const roleError = () => new AppError("conflict", "役割が合わないため連携できません", "QR をもう一度出してください");
const pairNotFound = () => new AppError("not_found", "このペアリングは見つかりません", "QR をもう一度出してください");

type Ticket = typeof pairTickets.$inferSelect;

// 保護者がいる（子どもとして連携済み）か・子どもがいる（保護者として連携済み）か
async function hasParent(tx: Executor, childId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: familyLinks.id })
    .from(familyLinks)
    .where(eq(familyLinks.childId, childId))
    .limit(1);
  return rows.length > 0;
}
async function hasChild(tx: Executor, parentId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: familyLinks.id })
    .from(familyLinks)
    .where(eq(familyLinks.parentId, parentId))
    .limit(1);
  return rows.length > 0;
}

// 待っている・読まれた QR が期限（10分）を過ぎていれば expired にする（聞かれたときに確かめる。ちょうど10分はまだ使える）
async function refreshExpiry(tx: Tx, row: Ticket): Promise<Ticket> {
  const open = row.state === "waiting" || row.state === "claimed";
  if (!open || !row.expiresAt || Date.now() <= row.expiresAt.getTime()) return row;
  const [updated] = await tx
    .update(pairTickets)
    .set({ state: "expired" })
    .where(eq(pairTickets.id, row.id))
    .returning();
  return updated ?? { ...row, state: "expired" };
}

async function lockTicket(tx: Tx, pairId: string): Promise<Ticket | undefined> {
  if (!isUuid(pairId)) return undefined;
  const [row] = await tx.select().from(pairTickets).where(eq(pairTickets.id, pairId)).for("update").limit(1);
  return row;
}

function requireInvolved(row: Ticket | undefined, caller: Caller): Ticket {
  if (!row || (row.childId !== caller.userId && row.parentId !== caller.userId)) throw pairNotFound();
  return row;
}

async function statusOf(tx: Executor, row: Ticket): Promise<PairStatus> {
  const ids = row.parentId ? [row.childId, row.parentId] : [row.childId];
  const people = await tx.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, ids));
  const child = people.find((p) => p.id === row.childId);
  if (!child) throw new AppError("internal");
  const parent = row.parentId ? people.find((p) => p.id === row.parentId) : undefined;
  return {
    pairId: row.id,
    state: row.state as PairStatus["state"],
    child: { id: child.id, name: row.childDisplayName || child.name || "子ども" },
    parentName: parent ? parent.name || "保護者" : null,
    // 期限の列が空の行（PR #48 の頃に作られた QR）は、作った時刻から10分とみなす
    expiresAt: (row.expiresAt ?? new Date(row.createdAt.getTime() + PAIR_TTL_MS)).toISOString(),
  };
}

// 子ども: QR を出す。前に出した未使用の QR は無効にする（Q10）。保護者・連携済みの子どもは conflict（Q2）
export async function startPair(caller: Caller, name?: string): Promise<PairTicket> {
  if (caller.role === "parent")
    throw new AppError("conflict", "保護者の端末では QR を出せません", "子どもの端末で QR を出してください");
  const database = await db();
  const code = randomCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIR_TTL_MS);
  const ticket = await database.transaction(async (tx) => {
    if (await hasParent(tx, caller.userId)) throw oneToOne();
    await tx
      .update(pairTickets)
      .set({ state: "expired", revokedAt: now })
      .where(and(eq(pairTickets.childId, caller.userId), inArray(pairTickets.state, ["waiting", "claimed"])));
    const [row] = await tx
      .insert(pairTickets)
      .values({
        codeHash: digest(code),
        childId: caller.userId,
        childDisplayName: name ?? caller.name,
        createdAt: now,
        expiresAt,
      })
      .returning({ id: pairTickets.id });
    if (!row) throw new AppError("internal");
    return row;
  });
  return { pairId: ticket.id, code, expiresAt: expiresAt.toISOString() };
}

// 子ども・保護者: 進み具合を聞く（自分が関わるペアリングだけ）
export async function readPairStatus(caller: Caller, pairId: string): Promise<PairStatus> {
  const database = await db();
  return database.transaction(async (tx) => {
    const row = requireInvolved(await lockTicket(tx, pairId), caller);
    return statusOf(tx, await refreshExpiry(tx, row));
  });
}

// 保護者: QR の番号を送る。まちがいが続いたら、しばらく断る（PAIR_CLAIM_MAX_FAILURES）
export async function claimPair(caller: Caller, code: string): Promise<PairStatus> {
  if (caller.role === "child")
    throw new AppError("forbidden", "子どもの端末では QR を読み取れません", "保護者の端末で読み取ってください");
  const database = await db();
  const since = new Date(Date.now() - PAIR_CLAIM_WINDOW_MS);
  await database
    .delete(pairClaimFailures)
    .where(and(eq(pairClaimFailures.userId, caller.userId), lte(pairClaimFailures.failedAt, since)));
  const [recent] = await database
    .select({ n: count() })
    .from(pairClaimFailures)
    .where(eq(pairClaimFailures.userId, caller.userId));
  if ((recent?.n ?? 0) >= PAIR_CLAIM_MAX_FAILURES)
    throw new AppError(
      "rate_limited",
      "QR コードの読み取りに何度も失敗したため、しばらく受け付けません",
      "10分ほど待ってから、子どもの端末で QR を出し直して読み取ってください",
    );
  try {
    const status = await database.transaction((tx) => claimInTx(tx, caller, code));
    await database.delete(pairClaimFailures).where(eq(pairClaimFailures.userId, caller.userId));
    return status;
  } catch (e) {
    if (e instanceof AppError && (e.code === "not_found" || e.code === "conflict"))
      await database.insert(pairClaimFailures).values({ userId: caller.userId, failedAt: new Date() });
    throw e;
  }
}

async function claimInTx(tx: Tx, caller: Caller, code: string): Promise<PairStatus> {
  const [found] = await tx
    .select()
    .from(pairTickets)
    .where(eq(pairTickets.codeHash, digest(code)))
    .for("update")
    .limit(1);
  if (!found) throw new AppError("not_found", "この QR コードは使えません", "子どもの端末で QR を出し直してください");
  if (found.state === "waiting" && found.expiresAt && Date.now() > found.expiresAt.getTime()) throw expiredError();
  if (found.state === "expired") throw expiredError();
  if (found.state !== "waiting") throw alreadyUsedError();
  if (found.childId === caller.userId)
    throw new AppError("conflict", "自分の QR コードは読み取れません", "保護者の端末で読み取ってください");
  if ((await hasChild(tx, caller.userId)) || (await hasParent(tx, found.childId))) throw oneToOne();
  const [claimed] = await tx
    .update(pairTickets)
    .set({ state: "claimed", parentId: caller.userId, claimedAt: new Date() })
    .where(and(eq(pairTickets.id, found.id), eq(pairTickets.state, "waiting")))
    .returning();
  if (!claimed) throw alreadyUsedError();
  return statusOf(tx, claimed);
}

// 子ども: 「はい / いいえ」で確定する（QR を出した本人だけ）。「はい」なら役割・つながり・設定の器を1回の処理で保存してから linked を返す
export async function confirmPair(caller: Caller, pairId: string, accept: boolean): Promise<PairStatus> {
  const database = await db();
  const result = await database.transaction(async (tx) => {
    const locked = requireInvolved(await lockTicket(tx, pairId), caller);
    if (locked.childId !== caller.userId)
      throw new AppError("forbidden", "QR を出した子どもだけが確定できます", "子どもの端末で確定してください");
    const row = await refreshExpiry(tx, locked);
    // 期限切れは expired を書き残してから断る（トランザクションの中で投げると、expired の書き込みも取り消されるため）
    if (row.state === "expired") return { error: expiredError() };
    if (row.state !== "claimed" || !row.parentId)
      throw new AppError(
        "conflict",
        "まだ保護者が読み取っていません",
        "保護者の端末で QR を読み取ってもらってください",
      );
    if (!accept) {
      const [rejected] = await tx
        .update(pairTickets)
        .set({ state: "rejected", rejectedAt: new Date() })
        .where(eq(pairTickets.id, row.id))
        .returning();
      return { status: await statusOf(tx, rejected ?? row) };
    }
    const parentId = row.parentId;
    // 2人の行を押さえてから確かめる（同じ保護者に2人の子どもが同時に「はい」を押しても、1人だけがつながるように）
    const people = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, [parentId, row.childId]))
      .orderBy(users.id)
      .for("update");
    const parent = people.find((p) => p.id === parentId);
    const child = people.find((p) => p.id === row.childId);
    if (!parent || !child || parent.role === "child" || child.role === "parent") throw roleError();
    // 読んでから確定するまでの間に、どちらかが別の相手と連携していないかを確かめ直す（D-7）
    if ((await hasChild(tx, parentId)) || (await hasParent(tx, row.childId))) throw oneToOne();
    await tx.update(users).set({ role: "parent", updatedAt: new Date() }).where(eq(users.id, parentId));
    await tx
      .update(users)
      .set({ role: "child", displayName: row.childDisplayName, updatedAt: new Date() })
      .where(eq(users.id, row.childId));
    await tx.insert(familyLinks).values({ parentId, childId: row.childId });
    await tx
      .insert(childConfigVersions)
      .values({ childId: row.childId })
      .onConflictDoNothing({ target: childConfigVersions.childId });
    const [linked] = await tx
      .update(pairTickets)
      .set({ state: "linked", confirmedAt: new Date() })
      .where(eq(pairTickets.id, row.id))
      .returning();
    return { status: await statusOf(tx, linked ?? row) };
  });
  if ("error" in result) throw result.error;
  return result.status;
}

// 子ども: 自分が出した QR（waiting / claimed）を取り消す。expired・rejected はそのまま返す。linked は conflict
export async function cancelPair(caller: Caller, pairId: string): Promise<PairStatus> {
  const database = await db();
  return database.transaction(async (tx) => {
    const row = requireInvolved(await lockTicket(tx, pairId), caller);
    if (row.childId !== caller.userId)
      throw new AppError("forbidden", "QR を出した子どもだけが取り消せます", "子どもの端末で操作してください");
    if (row.state === "linked")
      throw new AppError("conflict", "もう連携が確定しています", "つながりの状態を確かめてください");
    if (row.state !== "waiting" && row.state !== "claimed") return statusOf(tx, row);
    const [updated] = await tx
      .update(pairTickets)
      .set({ state: "expired", revokedAt: new Date() })
      .where(eq(pairTickets.id, row.id))
      .returning();
    return statusOf(tx, updated ?? row);
  });
}

// ── つながり（D2）──

export async function readLinkStatus(caller: Caller): Promise<LinkStatus> {
  const database = await db();
  const rows = await database
    .select({ parentId: familyLinks.parentId, childId: familyLinks.childId })
    .from(familyLinks)
    .where(or(eq(familyLinks.parentId, caller.userId), eq(familyLinks.childId, caller.userId)));
  const ids = rows.map((r) => (r.parentId === caller.userId ? r.childId : r.parentId));
  const partners = ids.length
    ? await database
        .select({ userId: users.id, name: users.displayName, role: users.role })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const normalized = partners
    .filter((p): p is typeof p & { role: "parent" | "child" } => p.role !== null)
    .map((p) => ({ userId: p.userId, name: p.name || "利用者", role: p.role }));
  const [self] = await database.select({ role: users.role }).from(users).where(eq(users.id, caller.userId)).limit(1);
  return { state: normalized.length ? "linked" : "unlinked", role: self?.role ?? null, partners: normalized };
}

export async function readFamily(caller: Caller): Promise<{ children: { id: string; name: string }[] }> {
  const status = await readLinkStatus(caller);
  return { children: status.partners.filter((p) => p.role === "child").map((p) => ({ id: p.userId, name: p.name })) };
}

// 保護者: 子どもとの連携を外す。子どもの合言葉をすべて使えなくし、子どもを役割のない状態（role: null）に戻す。
// 子どもの出しかけの QR も無効にする。連携していない子どもは not_found（route.ts の checkChildAccess で先に 403 になる）
// 外した子どもの家庭ごとのデータ（利用記録・計画・テスト期間・空白期間・対象外アプリ・Web サイト・アプリ一覧とアイコン・
// 端末の許可の状態）は同じトランザクションで消す（backend/src/db/family-unlink.ts）。
// なぜ: 残すと、別の保護者と紐づけ直したときに、その保護者に前の家庭の時期のデータが見える（セキュリティ検査 F-2 / PII-10）。
// 同じ保護者と紐づけ直しても、設定は最初から入れ直しになる。
// 誰が・いつ・どの子どもを外したかは audit_events に残す（F-7 / IPA-15）
// 子どもの合言葉は理由 family_unlink で無効にする。子どもの端末が次に呼ぶと、401 に理由が付いて返る（authorize。D-133）
export async function unlinkChild(
  caller: Caller,
  childId: string,
): Promise<{ childId: string; revokedSessions: number }> {
  const database = await db();
  return database.transaction(async (tx) => {
    const removed = isUuid(childId)
      ? await tx
          .delete(familyLinks)
          .where(and(eq(familyLinks.parentId, caller.userId), eq(familyLinks.childId, childId)))
          .returning({ id: familyLinks.id })
      : [];
    if (!removed.length)
      throw new AppError("not_found", "連携している子どもが見つかりません", "家族の一覧を更新してください");
    if (!(await hasParent(tx, childId)))
      await tx.update(users).set({ role: null, updatedAt: new Date() }).where(eq(users.id, childId));
    await tx
      .update(pairTickets)
      .set({ state: "expired", revokedAt: new Date() })
      .where(and(eq(pairTickets.childId, childId), inArray(pairTickets.state, ["waiting", "claimed"])));
    await clearChildFamilyData(tx, childId);
    await recordFamilyUnlink(tx, caller.userId, childId);
    return { childId, revokedSessions: await revokeAllSessions(tx, childId, "family_unlink") };
  });
}
