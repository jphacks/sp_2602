import { writeFile } from "node:fs/promises";

process.env.MOCK = "1";
for (const key of ["DATABASE_URL", "LOCAL_DB_DIR", "VERCEL_ENV", "GOOGLE_WEB_CLIENT_ID"]) delete process.env[key];
if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR || process.env.VERCEL_ENV || process.env.GOOGLE_WEB_CLIENT_ID)
  throw new Error("Refusing to run unless database, deployment, and OAuth configuration are unset");

const [{ eq, count }, { serve }, { default: app }, { signInMock }, { db }, schema, { todayString }] = await Promise.all([
  import("drizzle-orm"),
  import("@hono/node-server"),
  import("../../../../tmp/android-security-build/src/server/app.js"),
  import("../../../../tmp/android-security-build/src/server/auth.js"),
  import("../../../../tmp/android-security-build/src/server/db/index.js"),
  import("../../../../tmp/android-security-build/backend/src/db/schema/index.js"),
  import("../../../../tmp/android-security-build/contracts/dates.js"),
]);
const { users, usageSyncBatches, usageDayReports, usageRecords } = schema;
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 4315 });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const database = await db();
const child = await signInMock(`mock-input-minutes-${crypto.randomUUID()}`);
await database.update(users).set({ role: "child", displayName: "Synthetic Input Child" }).where(eq(users.id, child.userId));
const date = todayString(new Date());
const measuredAt = () => new Date().toISOString();
const counts = async () => {
  const [batches, reports, records] = await Promise.all([
    database.select({ value: count() }).from(usageSyncBatches),
    database.select({ value: count() }).from(usageDayReports),
    database.select({ value: count() }).from(usageRecords),
  ]);
  return { batches: Number(batches[0]?.value ?? 0), dayReports: Number(reports[0]?.value ?? 0), appRecords: Number(records[0]?.value ?? 0) };
};

const candidates: { field: "usedMinutes" | "restrictedMinutes"; label: string; value: unknown }[] = [];
for (const field of ["usedMinutes", "restrictedMinutes"] as const) {
  for (const [label, value] of [
    ["negative", -1],
    ["zero", 0],
    ["decimal", 1.5],
    ["max-safe-integer", Number.MAX_SAFE_INTEGER],
    ["string", "5"],
    ["null", null],
    ["array", [5]],
  ] as const) candidates.push({ field, label, value });
}

const outcomes: Record<string, unknown>[] = [];
try {
  const endpoint = "http://127.0.0.1:4315/api/usage/upload";
  let previousStarted = 0;
  for (const [index, candidate] of candidates.entries()) {
    const delay = previousStarted ? Math.max(0, 1050 - (Date.now() - previousStarted)) : 0;
    if (delay) await pause(delay);
    previousStarted = Date.now();
    const before = await counts();
    const minute = (n: number) => (n === "usedMinutes" ? candidate.value : 5);
    const restricted = (n: number) => (n === "restrictedMinutes" ? candidate.value : 5);
    const body = {
      submissionId: crypto.randomUUID(),
      childId: child.userId,
      days: [{
        date,
        measuredAt: measuredAt(),
        restrictedMinutes: restricted("restrictedMinutes"),
        apps: [{ packageName: "synthetic.input.app", label: "Synthetic app", usedMinutes: minute("usedMinutes"), excluded: false }],
      }],
    };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${child.token}` },
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => null);
    const after = await counts();
    outcomes.push({
      case: `${candidate.field}:${candidate.label}`,
      status: response.status,
      code: parsed?.code ?? null,
      expected: candidate.label === "zero" ? "accepted" : "rejected",
      databaseCountsUnchangedOnReject: response.status >= 400 ? JSON.stringify(before) === JSON.stringify(after) : null,
      before,
      after,
    });
  }
  const result = {
    runtime: "synthetic in-memory PGlite; loopback HTTP only",
    source: "isolated snapshot 0ddfc7e",
    requestCount: outcomes.length,
    minimumRequestStartSpacingMs: 1050,
    cases: outcomes,
  };
  await writeFile(new URL("./input-minutes.evidence.json", import.meta.url), JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  server.close();
}
