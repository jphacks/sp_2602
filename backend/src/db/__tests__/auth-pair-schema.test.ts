import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { familyLinks } from "../schema/family.js";
import { authIdentities, pairTickets, userSessions, users } from "../schema/index.js";

describe("authentication and pairing storage schema", () => {
  it("keeps account role nullable until the pairing flow assigns one", () => {
    const role = getTableConfig(users).columns.find((column) => column.name === "role");
    expect(role?.notNull).toBe(false);
  });

  it("stores unique external identities and session token digests", () => {
    const identity = getTableConfig(authIdentities);
    expect(identity.uniqueConstraints).toHaveLength(1);
    const session = getTableConfig(userSessions);
    expect(session.columns.find((column) => column.name === "token_hash")?.notNull).toBe(true);
    expect(session.columns.find((column) => column.name === "expires_at")?.notNull).toBe(false);
    // 無効にした理由（D-133）。無効にしていない行・0018 より前に無効にした行は NULL
    expect(session.columns.find((column) => column.name === "revoked_reason")?.notNull).toBe(false);
  });

  it("keeps QR code hashes unique and leaves expiry optional without fixing family cardinality", () => {
    const pair = getTableConfig(pairTickets);
    expect(pair.columns.find((column) => column.name === "code_hash")?.notNull).toBe(true);
    expect(pair.columns.find((column) => column.name === "expires_at")?.notNull).toBe(false);
    expect(pair.columns.map((column) => column.name)).toContain("revoked_at");
    expect(pair.uniqueConstraints).toHaveLength(1);
    const family = getTableConfig(familyLinks);
    expect(family.uniqueConstraints).toHaveLength(1);
  });
});
