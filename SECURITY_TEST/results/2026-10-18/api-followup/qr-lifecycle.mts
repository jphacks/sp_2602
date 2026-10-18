// Isolated HTTP test for PII-09 QR lifecycle: cancel, reissue invalidation, and post-logout/unlink behavior.
// Spaced >= 1.1s per request. No tokens or QR secrets are written to evidence.
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR || process.env.VERCEL_ENV || process.env.GOOGLE_WEB_CLIENT_ID) {
  throw new Error("Isolated environment required");
}
process.env.MOCK = "1";

const { default: app } = await import("../../../../tmp/android-security-build/src/server/app.js");
const { db } = await import("../../../../tmp/android-security-build/src/server/db/index.js");
await db();

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request("http://127.0.0.1:4316" + incoming.url, {
      method: incoming.method,
      headers: incoming.headers as HeadersInit,
      body: ["GET", "HEAD"].includes(incoming.method ?? "") ? undefined : incoming,
      duplex: "half",
    } as RequestInit);
    const response = await app.fetch(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.statusCode = 500;
    outgoing.end();
  }
});

await new Promise<void>((resolve) => server.listen(4316, "127.0.0.1", () => resolve()));

let lastCallAt = 0;
async function callApi(path: string, method: string, token: string | null, body?: unknown) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastCallAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:4316${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

try {
  const steps: Record<string, unknown>[] = [];

  // 1. Sign in synthetic unlinked child & unlinked parent
  const childAuth = await callApi("/api/auth/google", "POST", null, { idToken: "mock-qr-child-a" });
  const parentAuth = await callApi("/api/auth/google", "POST", null, { idToken: "mock-qr-parent-a" });
  const childToken = String(childAuth.json?.token ?? "");
  const parentToken = String(parentAuth.json?.token ?? "");

  // 2. Child issues QR #1, then cancels it; Parent attempts to claim cancelled QR #1
  const issue1 = await callApi("/api/pair/start", "POST", childToken, {});
  const code1 = String(issue1.json?.code ?? "");
  const pairId1 = String(issue1.json?.pairId ?? "");
  const cancel1 = await callApi("/api/pair/cancel", "POST", childToken, { pairId: pairId1 });
  const claimAfterCancel = await callApi("/api/pair/claim", "POST", parentToken, { code: code1 });
  steps.push({
    case: "PII-09-cancel-invalidation",
    issueStatus: issue1.status,
    cancelStatus: cancel1.status,
    cancelState: cancel1.json?.state ?? null,
    claimAfterCancelStatus: claimAfterCancel.status,
    claimAfterCancelErrorCode: (claimAfterCancel.json?.error as Record<string, unknown> | undefined)?.code ?? claimAfterCancel.json?.code ?? null,
  });

  // 3. Child issues QR #2, then reissues QR #3; Parent attempts to claim superseded QR #2, then claims active QR #3
  const issue2 = await callApi("/api/pair/start", "POST", childToken, {});
  const code2 = String(issue2.json?.code ?? "");
  const pairId2 = String(issue2.json?.pairId ?? "");
  const issue3 = await callApi("/api/pair/start", "POST", childToken, {});
  const code3 = String(issue3.json?.code ?? "");
  const pairId3 = String(issue3.json?.pairId ?? "");
  const status2AfterReissue = await callApi("/api/pair/status", "POST", childToken, { pairId: pairId2 });
  const claimOldAfterReissue = await callApi("/api/pair/claim", "POST", parentToken, { code: code2 });
  steps.push({
    case: "PII-09-reissue-invalidation-waiting",
    issue2Status: issue2.status,
    issue3Status: issue3.status,
    pairIdsDistinct: pairId2 !== pairId3,
    codesDistinct: code2 !== code3,
    oldTicketStateAfterReissue: status2AfterReissue.json?.state ?? null,
    claimOldAfterReissueStatus: claimOldAfterReissue.status,
    claimOldAfterReissueErrorCode: (claimOldAfterReissue.json?.error as Record<string, unknown> | undefined)?.code ?? claimOldAfterReissue.json?.code ?? null,
  });

  // 4. Parent claims active QR #3, then Child reissues QR #4 while #3 is claimed; verify #3 becomes expired and cannot be confirmed
  const claim3 = await callApi("/api/pair/claim", "POST", parentToken, { code: code3 });
  const issue4 = await callApi("/api/pair/start", "POST", childToken, {});
  const pairId4 = String(issue4.json?.pairId ?? "");
  const confirmOldClaimed3 = await callApi("/api/pair/confirm", "POST", childToken, { pairId: pairId3, accept: true });
  steps.push({
    case: "PII-09-reissue-invalidation-claimed",
    claim3Status: claim3.status,
    claim3State: claim3.json?.state ?? null,
    issue4Status: issue4.status,
    confirmOldClaimed3Status: confirmOldClaimed3.status,
    confirmOldClaimed3ErrorCode: (confirmOldClaimed3.json?.error as Record<string, unknown> | undefined)?.code ?? confirmOldClaimed3.json?.code ?? null,
  });

  // 5. Child signs out after issuing QR #4 (without UI cancel); verify whether child session is revoked (401 on pairStatus) and what happens if parent claims QR #4 while child is signed out
  const signOutChild = await callApi("/api/auth/sign-out", "POST", childToken, { otherDevices: false });
  const statusAfterSignOut = await callApi("/api/pair/status", "POST", childToken, { pairId: pairId4 });
  const code4 = String(issue4.json?.code ?? "");
  const claim4AfterChildSignOut = await callApi("/api/pair/claim", "POST", parentToken, { code: code4 });
  const confirm4WithRevokedChildToken = await callApi("/api/pair/confirm", "POST", childToken, { pairId: pairId4, accept: true });
  steps.push({
    case: "PII-09-signout-without-cancel-observation",
    signOutStatus: signOutChild.status,
    statusWithRevokedToken: statusAfterSignOut.status,
    claim4AfterChildSignOutStatus: claim4AfterChildSignOut.status,
    claim4AfterChildSignOutState: claim4AfterChildSignOut.json?.state ?? null,
    confirm4WithRevokedChildTokenStatus: confirm4WithRevokedChildToken.status,
  });

  const out = {
    executedAt: new Date().toISOString(),
    minSpacingMs: 1100,
    totalRequests: 17,
    rawSecretsSaved: false,
    steps,
  };
  writeFileSync(new URL("./qr-lifecycle-evidence.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
} finally {
  server.close();
}

