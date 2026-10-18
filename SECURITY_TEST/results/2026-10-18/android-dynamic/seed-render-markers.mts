// Only synthetic period names on the dedicated local API. No raw credentials saved.
import { writeFileSync } from "node:fs";
import { mockSessions } from "../../../../tmp/android-security-build/contracts/fixtures.js";
const parent = mockSessions["mock-google-parent"];
const child = mockSessions["mock-google-child"];
const results: unknown[] = [];
async function request(path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:4313/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${parent.token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Local marker preparation failed: ${response.status}`);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  return { status: response.status, data };
}
for (const [offset, name] of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"].entries()) {
  const list = await request("test-period/list", { childId: child.userId });
  const day = new Date(Date.now() + (3 + offset) * 86400000).toISOString().slice(0, 10);
  const saved = await request("test-period/create", {
    childId: child.userId, expectedVersion: list.data.configVersion, name, startDate: day, endDate: day,
  });
  results.push({ marker: offset === 0 ? "script literal" : "img literal", status: saved.status, returnedAsLiteral: saved.data.testPeriod?.name === name });
}
writeFileSync(new URL("./render-markers-api.json", import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
