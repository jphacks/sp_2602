// 確かめ役（V）が見つけた不具合。ここのテストは「正しい期待値」で書いてあり、直すまで失敗する（npm run check が落ちる）。
// 直したら、テストはそのまま残す（期待値を実装に合わせて書き換えない）。
//
// 不具合1（重い）: C8 の送信待ち（src/lib/usage-outbox.ts）で、契約に合わない記録が1件入ると、送信待ちが丸ごと消える。
//   原因: read() が一覧全体を OutboxList（中身は契約の UsageDayReport）で検査し、1件でも合わないと「ない（[]）」として返す。
//   そのため次の enqueue / update が [] に足して書き直し、まだ送っていない記録（昨日分など）が黙って消える。
//   MVP_SPEC 4.3・C8「検証エラーは該当データを隔離し、他の正常データは同期継続」「成功分だけ送信待ちを解除」に反する。
//   直し方の例: 保存の形（OutboxItem.days）は契約で検査せず緩い形（z.unknown など）で読み、1件ずつ検査して、合わない1件だけを
//   quarantined（lastError: bad_request）にする。もしくは enqueue の時点で UsageDayReport.safeParse し、合わない記録は入れない／直す。
//
// 不具合2（中くらい）: C2→C8 の記録づくり（src/lib/usage-calc.ts の toUsageDayReport）が、契約に合わない記録を作ることがある。
//   アプリ名（label）が 120 文字を超えるとそのまま入れている（契約 AppMinutes.label は max 120）。アプリが 1000 個を超える場合も同じ。
//   その記録はサーバで 400 になり、さらに不具合1 で送信待ちが丸ごと消える引き金になる。
//   直し方の例: label を 120 文字に切る（空なら packageName、packageName も 120 を超えるなら切る）。apps は 1000 件までにする。
//
// 不具合3（中くらい）: サーバの利用記録（src/server/mock/store.ts の usageUpload）が、日時として読めない measuredAt を受け付ける。
//   契約の IsoDateTime が z.string().min(1) なので "abc" も通り、その日の記録として保存される。以後は Date.parse が NaN になり、
//   「新しい測定が勝つ」の比較（Date.parse(新) > Date.parse(今)）が必ず false になって、その日の記録は二度と更新されない（親に古い分数が出続ける）。
//   直し方の例: contracts/schemas.ts の IsoDateTime を z.iso.datetime({ offset: true })（または Date.parse が数になる refine）にする。
//   これで 400 bad_request になり、端末側は隔離する（MVP_SPEC 4.3 の「検証エラーの隔離」）。
//
// 不具合4（軽い）: 子どもが QR を出すときに入れた呼び名（PairStart.name）が、紐づけの後に消える。
//   紐づけの途中（pairClaim・pairConfirm の child.name）は呼び名が出るのに、確定後の familyGet・linkStatus・authMe は
//   Google のアカウント名を返す。保護者は「たろう」を確かめて連携したのに、ホームには別の名前が出る。
//   契約の PairStart のコメント「name は画面に出す呼び名（省くと Google のアカウント名）」に反する。
//   直し方の例: src/server/mock/store.ts の pairConfirm で linked にするとき、child.name = p.childName にする
//   （または D2 のつながりに呼び名を持たせ、familyGet・linkStatus はそれを返す）。
import { UsageDayReport } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import type { KeyValueStorage } from "@/lib/storage";
import { toUsageDayReport } from "@/lib/usage-calc";
import { createUsageOutbox } from "@/lib/usage-outbox";
import { CHILD, CHILD_ID, fresh, get, newPerson, ok, PARENT, post } from "./helpers";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

const goodDay = (date: string) => ({ date, measuredAt: `${date}T12:00:00.000Z`, restrictedMinutes: 5, apps: [] });

describe("不具合1: 契約に合わない記録が1件入ると、送信待ちが丸ごと消える（usage-outbox）", () => {
  it("送れていない正しい記録2件は、契約に合わない記録が後から入っても消えない", async () => {
    const outbox = createUsageOutbox({
      storage: memoryStorage(),
      send: async () => {
        throw new Error("offline");
      },
    });
    await outbox.enqueue(CHILD_ID, [goodDay("2026-10-13")]);
    await outbox.enqueue(CHILD_ID, [goodDay("2026-10-14")]);
    const bad = { ...goodDay("2026-10-15"), restrictedMinutes: 5000 }; // 契約外（0〜1440）
    await outbox.enqueue(CHILD_ID, [bad]);
    await outbox.enqueue(CHILD_ID, [goodDay("2026-10-16")]);
    const dates = (await outbox.list()).flatMap((x) => x.days.map((d) => d.date));
    expect(dates).toEqual(expect.arrayContaining(["2026-10-13", "2026-10-14", "2026-10-16"]));
  });
});

describe("不具合2: toUsageDayReport が契約に合わない記録を作る（usage-calc）", () => {
  it("アプリ名が 120 文字を超えても、作った記録は契約（UsageDayReport）に合う", () => {
    const report = toUsageDayReport(
      {
        status: "ok",
        date: "2026-10-15",
        measuredAt: "2026-10-15T03:00:00.000Z",
        apps: [{ packageName: "com.example.long", label: "あ".repeat(130), usedMinutes: 5 }],
      },
      [],
    );
    expect(UsageDayReport.safeParse(report).success).toBe(true);
  });
});

describe("不具合3: 日時として読めない measuredAt を受け付け、その日の記録が二度と更新されなくなる（store.usageUpload）", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  it("measuredAt が日時でない記録は 400 bad_request", async () => {
    const res = await post(
      "/api/usage/upload",
      {
        submissionId: crypto.randomUUID(),
        childId: CHILD_ID,
        days: [{ date: "2026-10-15", measuredAt: "not-a-date", restrictedMinutes: 10, apps: [] }],
      },
      CHILD,
    );
    expect(res.status).toBe(400);
  });

  it("（受け付けてしまった場合でも）後から届いた正しい測定で、その日の記録が更新される", async () => {
    await post(
      "/api/usage/upload",
      {
        submissionId: crypto.randomUUID(),
        childId: CHILD_ID,
        days: [{ date: "2026-10-15", measuredAt: "not-a-date", restrictedMinutes: 10, apps: [] }],
      },
      CHILD,
    );
    await post(
      "/api/usage/upload",
      {
        submissionId: crypto.randomUUID(),
        childId: CHILD_ID,
        days: [{ date: "2026-10-15", measuredAt: "2026-10-15T03:00:00.000Z", restrictedMinutes: 40, apps: [] }],
      },
      CHILD,
    );
    const view = await ok<{ days: { usedMinutes: number | null }[] }>(
      post("/api/usage/get", { childId: CHILD_ID, from: "2026-10-15", to: "2026-10-15" }, PARENT),
    );
    expect(view.days[0]?.usedMinutes).toBe(40);
  });
});

describe("不具合4: QR を出すときの呼び名が、紐づけの後に消える（store.pairConfirm）", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  it("紐づけの後、保護者の家族一覧・連携状態に出る子どもの名前は、QR を出すときに入れた呼び名", async () => {
    const child = await newPerson("nick-c");
    const parent = await newPerson("nick-p");
    const t = await ok<{ code: string; pairId: string }>(post("/api/pair/start", { name: "たろう" }, child.token));
    const claimed = await ok<{ child: { name: string } }>(post("/api/pair/claim", { code: t.code }, parent.token));
    expect(claimed.child.name).toBe("たろう");
    await ok(post("/api/pair/confirm", { pairId: t.pairId, accept: true }, child.token));
    const fam = await ok<{ children: { name: string }[] }>(get("/api/family/get", parent.token));
    const link = await ok<{ partners: { name: string }[] }>(get("/api/link/status", parent.token));
    expect(fam.children.map((c) => c.name)).toEqual(["たろう"]);
    expect(link.partners.map((p) => p.name)).toEqual(["たろう"]);
  });
});
