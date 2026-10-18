// 呼び出し回数の上限（セキュリティ検査 F-5 / AVL-01）。窓（windowMs）の間に同じ相手から max 回呼ばれたら、その間は rate_limited（429）。
// 数は DB の表 rate_limit_hits に残す（Vercel のインスタンスはメモリを共有しないため。pairClaim の pair_claim_failures と同じ考え）。
// 断った呼び出しは数えない（窓が過ぎれば、また受け付ける）。同時に届いた分だけ上限を少し超えることはある（数えてから書くため。厳密さより軽さを取る）
//   - authGoogle: IP ごと（Google の確認より先）と、ログインする人（Google の sub・MOCK の idToken）ごと
//   - pairStart : 利用者ごと（1回ごとに pair_tickets へ行を書くため）
import { and, count, eq, lte } from "drizzle-orm";
import { rateLimitHits } from "../../backend/src/db/schema/index.js";
import { digest } from "./auth/digest.js";
import { db } from "./db/index.js";
import { AppError } from "./errors.js";

export type RateLimit = { bucket: string; max: number; windowMs: number; message: string; hint: string };

// IP ごとのログイン: 1分に20回。家庭や学校では保護者と子どもの端末が同じ IP になるので、人ごとより多めにする
export const AUTH_IP_LIMIT: RateLimit = {
  bucket: "auth-ip",
  max: 20,
  windowMs: 60_000,
  message: "ログインの回数が多すぎます",
  hint: "1分ほど待ってから、もう一度ログインしてください",
};
// 同じ人のログイン: 1分に10回
export const AUTH_SUBJECT_LIMIT: RateLimit = {
  bucket: "auth-subject",
  max: 10,
  windowMs: 60_000,
  message: "ログインの回数が多すぎます",
  hint: "1分ほど待ってから、もう一度ログインしてください",
};
// QR を出す: 1人1分に5回（QR は10分使えるので、ふつうは1回で足りる）
export const PAIR_START_LIMIT: RateLimit = {
  bucket: "pair-start",
  max: 5,
  windowMs: 60_000,
  message: "QR コードを出す回数が多すぎます",
  hint: "1分ほど待ってから、もう一度 QR を出してください",
};

// key（IP・subject・利用者 id）の呼び出しを1回数える。上限に達していれば rate_limited を投げる（数えない）。
// key はハッシュにして残す（IP をそのまま DB に置かない）
export async function countCall(limit: RateLimit, key: string): Promise<void> {
  const database = await db();
  const now = new Date();
  const keyHash = digest(`${limit.bucket}:${key}`);
  // 窓を過ぎた行は、その bucket の分をまとめて消す（ほかの相手の古い行も残さない）
  await database
    .delete(rateLimitHits)
    .where(
      and(eq(rateLimitHits.bucket, limit.bucket), lte(rateLimitHits.hitAt, new Date(now.getTime() - limit.windowMs))),
    );
  const [recent] = await database
    .select({ n: count() })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.bucket, limit.bucket), eq(rateLimitHits.keyHash, keyHash)));
  if ((recent?.n ?? 0) >= limit.max) throw new AppError("rate_limited", limit.message, limit.hint);
  await database.insert(rateLimitHits).values({ bucket: limit.bucket, keyHash, hitAt: now });
}

// 呼び出し元の IP。Vercel が付ける x-real-ip・x-forwarded-for の先頭を使う（Vercel は利用者が送った値を上書きするので、偽れない）。
// どちらもなければ null（手元のサーバ・テスト。IP ごとの上限は数えず、人ごとの上限だけが効く）。
// 手元のサーバでは利用者がこのヘッダを自分で付けられるが、そうしても IP ごとの上限を逃れるだけで、人ごとの上限は残る
export function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
