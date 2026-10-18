// 環境の読み取り。値はサーバの起動時ではなく、使うたびに読む（テストで差し替えられるように）。
//   MOCK=1                : "mock-" で始まる idToken のログインと、その人たちの合言葉を受け付け、手元の DB（PGlite）に
//                           デモの3人（contracts/fixtures.ts）と見本のデータを入れる（src/server/seed/demo.ts）。
//                           DATABASE_URL の DB（Neon など）には自動では入れない（src/server/db/index.ts の seedsMockOnOpen）。
//                           MOCK=1 でないサーバでは、DB に残った MOCK のログインの人の合言葉も 401（src/server/auth.ts の findSession）。
//                           Vercel の本番（VERCEL_ENV=production）では入れても無視する（デモの人の合言葉は固定で、だれでも知っているため。
//                           本番で見本が要るときは npm run db:seed-demo。固定の合言葉は作らず、Google でログインした親子に入れる）。D-97・D-126
//   GOOGLE_WEB_CLIENT_ID  : 本物の Google ログインで、ID トークンの宛先（aud）として確かめる Web のクライアント ID（docs/google-login-setup.md）
export const isMock = () => process.env.MOCK === "1" && process.env.VERCEL_ENV !== "production";

// 空は未設定として扱う
export const googleWebClientId = (): string | null => process.env.GOOGLE_WEB_CLIENT_ID?.trim() || null;
