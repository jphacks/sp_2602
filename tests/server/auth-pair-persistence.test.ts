import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { claimPair, confirmPair, signInGoogle, startPair } from "@/server/auth";
import { db } from "@/server/db";
import { authIdentities, familyLinks, pairTickets, userSessions, users } from "../../backend/src/db/schema";

describe("persistent C1 authentication and pairing", () => {
  beforeAll(() => {
    // Keep these tests isolated from developer/hosted databases; src/server/db opens PGlite.
    vi.stubEnv("MOCK", "0");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
  });

  afterAll(() => vi.unstubAllEnvs());

  it("stores only a session digest and preserves a saved child display name on later Google login", async () => {
    const d = await db();
    const sub = `auth-pair-${crypto.randomUUID()}`;
    const first = await signInGoogle(sub, "Google name");
    await d.update(users).set({ role: "child", displayName: "Child chosen name" }).where(eq(users.id, first.userId));

    const second = await signInGoogle(sub, "Changed Google profile name");
    expect(second.userId).toBe(first.userId);
    expect(second.name).toBe("Child chosen name");

    const [identity] = await d.select().from(authIdentities).where(eq(authIdentities.userId, first.userId));
    const sessions = await d.select().from(userSessions).where(eq(userSessions.userId, first.userId));
    expect(identity?.subject).toBe(sub);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.tokenHash !== first.token && session.tokenHash !== second.token)).toBe(
      true,
    );
    expect(sessions.every((session) => session.tokenHash.length === 64)).toBe(true);
  });

  it("uses an unexpired QR ticket, keeps its code digest private, and commits role, D2 edge, and ticket state", async () => {
    const child = await signInGoogle(`pair-child-${crypto.randomUUID()}`, "Child Google name");
    const parent = await signInGoogle(`pair-parent-${crypto.randomUUID()}`, "Parent Google name");
    const ticket = await startPair(child, "Child preferred name");
    expect(ticket.expiresAt).toBeNull();

    const d = await db();
    const [stored] = await d.select().from(pairTickets).where(eq(pairTickets.id, ticket.pairId));
    expect(stored?.codeHash).not.toBe(ticket.code);
    expect(stored?.expiresAt).toBeNull();

    const claimed = await claimPair(parent, ticket.code);
    expect(claimed.state).toBe("claimed");
    const linked = await confirmPair(child, ticket.pairId, true);
    expect(linked.state).toBe("linked");

    const [childRow] = await d.select().from(users).where(eq(users.id, child.userId));
    const [parentRow] = await d.select().from(users).where(eq(users.id, parent.userId));
    const [edge] = await d.select().from(familyLinks).where(eq(familyLinks.childId, child.userId));
    const [finalTicket] = await d.select().from(pairTickets).where(eq(pairTickets.id, ticket.pairId));
    expect(childRow).toMatchObject({ role: "child", displayName: "Child preferred name" });
    expect(parentRow?.role).toBe("parent");
    expect(edge).toMatchObject({ parentId: parent.userId, childId: child.userId });
    expect(finalTicket?.state).toBe("linked");
  });
});
