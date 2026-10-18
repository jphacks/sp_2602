import { writeFile } from "node:fs/promises";

process.env.MOCK = "1";
for (const key of ["DATABASE_URL", "LOCAL_DB_DIR", "VERCEL_ENV", "GOOGLE_WEB_CLIENT_ID"]) delete process.env[key];
if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR || process.env.VERCEL_ENV || process.env.GOOGLE_WEB_CLIENT_ID)
  throw new Error("Refusing to run unless database, deployment, and OAuth configuration are unset");

// Load application modules only after the isolation environment is established.
const [{ and, eq }, { serve }, { default: app }, { signInMock, SESSION_IDLE_MS }, { db }, schema, { digest }, { mockSessions }] =
  await Promise.all([
    import("drizzle-orm"),
    import("@hono/node-server"),
    import("../../../../tmp/android-security-build/src/server/app.js"),
    import("../../../../tmp/android-security-build/src/server/auth.js"),
    import("../../../../tmp/android-security-build/src/server/db/index.js"),
    import("../../../../tmp/android-security-build/backend/src/db/schema/index.js"),
    import("../../../../tmp/android-security-build/src/server/auth/digest.js"),
    import("../../../../tmp/android-security-build/contracts/fixtures.js"),
  ]);
const { userSessions, users, familyLinks, usageSyncBatches, usageDayReports, usageRecords } = schema;

const port = 4315;
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const results: Record<string, unknown> = {};

try {
  const database = await db();
  const parentA = mockSessions["mock-google-parent"];
  const childBLogin = await signInMock(`mock-api-followup-child-${Date.now()}`);
  const parentBLogin = await signInMock(`mock-api-followup-parent-${Date.now()}`);
  await database.update(users).set({ role: "parent", displayName: "Synthetic Parent B" }).where(eq(users.id, parentBLogin.userId));
  await database.update(users).set({ role: "child", displayName: "Synthetic Child B" }).where(eq(users.id, childBLogin.userId));
  await database.insert(familyLinks).values({ parentId: parentBLogin.userId, childId: childBLogin.userId });

  const submissionId = "8ec6a5f3-7f09-4cb6-b5d7-107ba9a54d21";
  const usageDate = new Date().toISOString().slice(0, 10);
  await database.insert(usageSyncBatches).values({ submissionId, childId: childBLogin.userId, payloadHash: "synthetic-followup" });
  await database.insert(usageDayReports).values({ submissionId, childId: childBLogin.userId, usageDate, measuredAt: new Date(), restrictedMinutes: 7 });
  await database.insert(usageRecords).values({ submissionId, childId: childBLogin.userId, usageDate, appId: "synthetic.app", label: "Synthetic usage", usedMinutes: 7, excluded: false });

  const endpoint = `http://127.0.0.1:${port}`;
  const request = async (name: string, token: string, body: unknown) => {
    const startedAt = Date.now();
    const response = await fetch(`${endpoint}${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => null);
    const serialized = JSON.stringify(responseBody);
    return { status: response.status, code: responseBody?.code ?? null, bodyContainsSyntheticUsageMarker: serialized.includes("synthetic.app"), elapsedMs: Date.now() - startedAt };
  };

  const unknownToken = `forged-${crypto.randomUUID()}`;
  results.API02_unknown_bearer = await request("/api/config/get", unknownToken, { childId: parentA.userId });
  await wait(1100);
  const idleBefore = new Date(Date.now() - SESSION_IDLE_MS - 60_000);
  await database.update(userSessions).set({ lastUsedAt: idleBefore }).where(eq(userSessions.tokenHash, digest(parentA.token)));
  results.API02_idle_expired_session = await request("/api/config/get", parentA.token, { childId: parentA.userId });
  await wait(1100);

  await signInMock("mock-google-parent"); // reissue the fixed synthetic test session after the idle-expiry case
  results.API04_parent_a_read_child_b_usage = await request("/api/usage/get", parentA.token, { childId: childBLogin.userId, from: usageDate, to: usageDate });
  await wait(1100);
  results.API04_parent_b_read_own_child_usage = await request("/api/usage/get", parentBLogin.token, { childId: childBLogin.userId, from: usageDate, to: usageDate });

  await writeFile(new URL("./evidence.json", import.meta.url), JSON.stringify({ runtime: "synthetic in-memory PGlite; loopback HTTP only", route: "isolated snapshot 0ddfc7e", cases: results }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.close();
}
