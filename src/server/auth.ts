import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Database } from "../../backend/src/db/index.js";
import {
  authIdentities,
  childConfigVersions,
  familyLinks,
  pairTickets,
  userSessions,
  users,
} from "../../backend/src/db/schema/index.js";
import type { AuthRule } from "../../contracts/api.js";
import type { LinkStatus, PairStatus, PairTicket, Session } from "../../contracts/schemas.js";
import { db } from "./db/index.js";
import { isMock } from "./env.js";
import { AppError } from "./errors.js";
import { getStore } from "./mock/store.js";

export type Caller = Session;

export function tokenOf(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return m?.[1]?.trim() || null;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const randomCode = () => randomBytes(32).toString("hex");

export async function signInGoogle(sub: string, name: string): Promise<Session> {
  if (isMock()) return getStore().signInGoogle(sub, name);
  const database = await db();
  const token = randomToken();
  const session = await database.transaction(async (tx) => {
    let [identity] = await tx
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, "google"), eq(authIdentities.subject, sub)))
      .limit(1);
    let userId: string;
    if (identity) {
      userId = identity.userId;
      // Pair confirmation may store a child-facing display name. Preserve an existing
      // name and only fill accounts that still have no display name.
      await tx
        .update(users)
        .set({ displayName: name, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.displayName)));
    } else {
      const [created] = await tx.insert(users).values({ displayName: name }).returning({ id: users.id });
      if (!created) throw new AppError("internal");
      const [insertedIdentity] = await tx
        .insert(authIdentities)
        .values({ userId: created.id, provider: "google", subject: sub })
        .onConflictDoNothing({ target: [authIdentities.provider, authIdentities.subject] })
        .returning({ userId: authIdentities.userId });
      // A concurrent first login may have won the unique provider/subject race.
      identity = insertedIdentity
        ? undefined
        : (
            await tx
              .select()
              .from(authIdentities)
              .where(and(eq(authIdentities.provider, "google"), eq(authIdentities.subject, sub)))
              .limit(1)
          )[0];
      if (identity) {
        userId = identity.userId;
        await tx.delete(users).where(eq(users.id, created.id));
      } else {
        userId = insertedIdentity!.userId;
      }
    }
    const [user] = await tx
      .select({ id: users.id, name: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new AppError("internal");
    await tx.insert(userSessions).values({ userId, tokenHash: digest(token) });
    return { userId: user.id, name: user.name || name, role: user.role };
  });
  return { ...session, token };
}

export async function authorize(rule: AuthRule, request: Request): Promise<Caller | null> {
  if (rule === "none") return null;
  const token = tokenOf(request);
  let caller: Session | null = null;
  if (token) {
    if (isMock()) caller = getStore().findSession(token);
    else caller = await findPersistentSession(token);
  }
  if (!caller) throw new AppError("unauthorized");
  if (rule === "parent" && caller.role !== "parent")
    throw new AppError("forbidden", "保護者だけができる操作です", "保護者の端末から操作してください");
  if (rule === "child" && caller.role !== "child")
    throw new AppError("forbidden", "子どもの端末だけが送れる情報です", "子どもの端末から送ってください");
  return caller;
}

async function findPersistentSession(token: string): Promise<Session | null> {
  const database = await db();
  const now = new Date();
  const [row] = await database
    .select({ userId: users.id, name: users.displayName, role: users.role, sessionId: userSessions.id })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, digest(token)),
        isNull(userSessions.revokedAt),
        or(isNull(userSessions.expiresAt), gt(userSessions.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return null;
  await database.update(userSessions).set({ lastUsedAt: now }).where(eq(userSessions.id, row.sessionId));
  return { token, userId: row.userId, name: row.name || "利用者", role: row.role };
}

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
    const linked = isMock()
      ? getStore().isLinked(caller.userId, childId)
      : (
          await (
            await db()
          )
            .select({ id: familyLinks.id })
            .from(familyLinks)
            .where(and(eq(familyLinks.parentId, caller.userId), eq(familyLinks.childId, childId)))
            .limit(1)
        ).length > 0;
    if (!linked)
      throw new AppError("forbidden", "連携していない子どもの情報は扱えません", "QR で連携してから操作してください");
    return;
  }
  throw new AppError("forbidden", "まだ家族の連携が済んでいません", "QR で連携してから操作してください");
}

function roleError() {
  return new AppError("conflict", "役割が合わないため連携できません", "QR をもう一度出してください");
}
function expiredError() {
  return new AppError("conflict", "この QR コードの利用は終了しています", "子どもの端末で QR を出し直してください");
}
function alreadyUsedError() {
  return new AppError("conflict", "この QR コードはもう使われています", "子どもの端末で QR を出し直してください");
}
function assertDbCallerRole(caller: Caller, wanted: "parent" | "child") {
  if (caller.role === (wanted === "parent" ? "child" : "parent")) {
    throw new AppError(
      "forbidden",
      wanted === "parent" ? "子どもの端末では QR を読み取れません" : "保護者の端末では QR を出せません",
    );
  }
}

async function pairStatusRow(database: Database, row: typeof pairTickets.$inferSelect): Promise<PairStatus> {
  const [child] = await database
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(eq(users.id, row.childId));
  const parent = row.parentId
    ? (await database.select({ name: users.displayName }).from(users).where(eq(users.id, row.parentId)).limit(1))[0]
    : undefined;
  if (!child) throw new AppError("internal");
  return {
    pairId: row.id,
    state: row.state as PairStatus["state"],
    child: { id: child.id, name: row.childDisplayName || child.name || "子ども" },
    parentName: parent?.name ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function requireInvolved(row: typeof pairTickets.$inferSelect | undefined, caller: Caller) {
  if (!row || (row.childId !== caller.userId && row.parentId !== caller.userId)) {
    throw new AppError("not_found", "このペアリングは見つかりません", "QR をもう一度出してください");
  }
  return row;
}

function refreshExpiry(row: typeof pairTickets.$inferSelect) {
  if ((row.state === "waiting" || row.state === "claimed") && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { ...row, state: "expired" as const };
  }
  return row;
}

export async function startPair(caller: Caller, name?: string): Promise<PairTicket> {
  if (isMock()) return getStore().pairStart(caller, name);
  assertDbCallerRole(caller, "child");
  const database = await db();
  const code = randomCode();
  const [ticket] = await database
    .insert(pairTickets)
    .values({
      codeHash: digest(code),
      childId: caller.userId,
      childDisplayName: name ?? caller.name,
    })
    .returning({ id: pairTickets.id, expiresAt: pairTickets.expiresAt });
  if (!ticket) throw new AppError("internal");
  return { pairId: ticket.id, code, expiresAt: ticket.expiresAt?.toISOString() ?? null };
}

export async function claimPair(caller: Caller, code: string): Promise<PairStatus> {
  if (isMock()) return getStore().pairClaim(caller, code);
  assertDbCallerRole(caller, "parent");
  const database = await db();
  const result = await database.transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(pairTickets)
      .where(eq(pairTickets.codeHash, digest(code)))
      .for("update")
      .limit(1);
    if (!found) throw new AppError("not_found", "この QR コードは使えません", "子どもの端末で QR を出し直してください");
    const row = refreshExpiry(found);
    if (row.state === "expired") {
      if (found.state !== "expired")
        await tx.update(pairTickets).set({ state: "expired" }).where(eq(pairTickets.id, found.id));
      return { expired: true as const };
    }
    if (row.state !== "waiting") throw alreadyUsedError();
    if (row.childId === caller.userId)
      throw new AppError("conflict", "自分の QR コードは読み取れません", "保護者の端末で読み取ってください");
    const [claimed] = await tx
      .update(pairTickets)
      .set({ state: "claimed", parentId: caller.userId, claimedAt: new Date() })
      .where(and(eq(pairTickets.id, row.id), eq(pairTickets.state, "waiting")))
      .returning();
    if (!claimed) throw alreadyUsedError();
    return { expired: false as const, ticket: claimed };
  });
  if (result.expired) throw expiredError();
  return pairStatusRow(database, result.ticket);
}

export async function confirmPair(caller: Caller, pairId: string, accept: boolean): Promise<PairStatus> {
  if (isMock()) return getStore().pairConfirm(caller, pairId, accept);
  assertDbCallerRole(caller, "child");
  const database = await db();
  const result = await database.transaction(async (tx) => {
    const [found] = await tx.select().from(pairTickets).where(eq(pairTickets.id, pairId)).for("update").limit(1);
    const row = requireInvolved(found, caller);
    if (row.childId !== caller.userId)
      throw new AppError("forbidden", "QR を出した子どもだけが確定できます", "子どもの端末で確定してください");
    const current = refreshExpiry(row);
    if (current.state === "expired") {
      if (row.state !== "expired")
        await tx.update(pairTickets).set({ state: "expired" }).where(eq(pairTickets.id, row.id));
      return { expired: true as const };
    }
    if (current.state !== "claimed" || !current.parentId)
      throw new AppError(
        "conflict",
        "まだ保護者が読み取っていません",
        "保護者の端末で QR を読み取ってもらってください",
      );
    if (!accept) {
      const [rejected] = await tx
        .update(pairTickets)
        .set({ state: "rejected", rejectedAt: new Date() })
        .where(and(eq(pairTickets.id, row.id), eq(pairTickets.state, "claimed")))
        .returning();
      if (!rejected) throw alreadyUsedError();
      return { expired: false as const, ticket: rejected };
    }
    const parentId = current.parentId;
    const [parent] = await tx.select({ role: users.role }).from(users).where(eq(users.id, parentId)).limit(1);
    const [child] = await tx.select({ role: users.role }).from(users).where(eq(users.id, current.childId)).limit(1);
    if (!parent || !child || parent.role === "child" || child.role === "parent") throw roleError();
    const [parentUpdate] = await tx
      .update(users)
      .set({ role: "parent" })
      .where(and(eq(users.id, parentId), or(isNull(users.role), eq(users.role, "parent"))))
      .returning({ id: users.id });
    const [childUpdate] = await tx
      .update(users)
      .set({ role: "child", displayName: current.childDisplayName })
      .where(and(eq(users.id, current.childId), or(isNull(users.role), eq(users.role, "child"))))
      .returning({ id: users.id });
    if (!parentUpdate || !childUpdate) throw roleError();
    await tx
      .insert(familyLinks)
      .values({ parentId, childId: current.childId })
      .onConflictDoNothing({ target: [familyLinks.parentId, familyLinks.childId] });
    await tx
      .insert(childConfigVersions)
      .values({ childId: current.childId })
      .onConflictDoNothing({ target: childConfigVersions.childId });
    const [linked] = await tx
      .update(pairTickets)
      .set({ state: "linked", confirmedAt: new Date() })
      .where(and(eq(pairTickets.id, row.id), eq(pairTickets.state, "claimed")))
      .returning();
    if (!linked) throw alreadyUsedError();
    return { expired: false as const, ticket: linked };
  });
  if (result.expired) throw expiredError();
  return pairStatusRow(database, result.ticket);
}

export async function readPairStatus(caller: Caller, pairId: string): Promise<PairStatus> {
  if (isMock()) return getStore().pairStatus(caller, pairId);
  const database = await db();
  const row = await database.transaction(async (tx) => {
    const [found] = await tx.select().from(pairTickets).where(eq(pairTickets.id, pairId)).for("update").limit(1);
    const current = requireInvolved(found, caller);
    const refreshed = refreshExpiry(current);
    if (refreshed.state === "expired" && current.state !== "expired") {
      const [updated] = await tx
        .update(pairTickets)
        .set({ state: "expired" })
        .where(eq(pairTickets.id, current.id))
        .returning();
      return updated ?? refreshed;
    }
    return refreshed;
  });
  return pairStatusRow(database, row);
}

export async function cancelPair(caller: Caller, pairId: string): Promise<PairStatus> {
  if (isMock()) return getStore().pairCancel(caller, pairId);
  assertDbCallerRole(caller, "child");
  const database = await db();
  const result = await database.transaction(async (tx) => {
    const [found] = await tx.select().from(pairTickets).where(eq(pairTickets.id, pairId)).for("update").limit(1);
    const row = requireInvolved(found, caller);
    if (row.childId !== caller.userId)
      throw new AppError("forbidden", "QR を出した子どもだけが取り消せます", "子どもの端末で操作してください");
    if (row.state === "linked")
      throw new AppError("conflict", "もう連携が確定しています", "つながりの状態を確かめてください");
    if (row.state === "waiting" || row.state === "claimed") {
      const [updated] = await tx
        .update(pairTickets)
        .set({ state: "expired", revokedAt: new Date() })
        .where(eq(pairTickets.id, row.id))
        .returning();
      return updated ?? row;
    }
    return row;
  });
  return pairStatusRow(database, result);
}

export async function readLinkStatus(caller: Caller): Promise<LinkStatus> {
  if (isMock()) return getStore().linkStatus(caller);
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
        .where(or(...ids.map((id) => eq(users.id, id))))
    : [];
  const normalized = partners
    .filter((p): p is typeof p & { role: "parent" | "child" } => p.role !== null)
    .map((p) => ({ userId: p.userId, name: p.name || "利用者", role: p.role }));
  const [self] = await database.select({ role: users.role }).from(users).where(eq(users.id, caller.userId)).limit(1);
  return { state: normalized.length ? "linked" : "unlinked", role: self?.role ?? null, partners: normalized };
}

export async function readFamily(caller: Caller): Promise<{ children: { id: string; name: string }[] }> {
  if (isMock()) return getStore().family(caller);
  const status = await readLinkStatus(caller);
  return { children: status.partners.filter((p) => p.role === "child").map((p) => ({ id: p.userId, name: p.name })) };
}
