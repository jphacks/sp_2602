// サーバの入口。契約（contracts/api.ts）の API の表どおりに、handlers/ の処理を Hono につなぐ。
// 手元は npm run dev:server（src/server/dev.ts）、Vercel では最上位の server.ts がこれを公開する。
// パスの手書きはしない。API を足すときは契約に足し、handlers/ に同じ名前の処理を置いて index.ts から export する。
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { api } from "../../contracts/api.js";
import { errorStatus, errorText } from "../../contracts/errors.js";
import { toApiError } from "./errors.js";
import * as handlers from "./handlers/index.js";

type Handler = (request: Request) => Promise<Response>;

// 契約にある API に処理が足りないと、ここで型エラーになる（npm run typecheck）。
const table: { [K in keyof typeof api]: Handler } = handlers;

const app = new Hono();

// 本文の大きさの上限。契約で一番大きくなりうる入力（usageUpload: 7日 × 1000 アプリ）でも 5MB ほどなので、余裕をみて 8MB。
// なぜ: 上限がないと、合言葉なしで呼べる authGoogle に数百 MB の本文を送るだけで、サーバがそれを全部メモリに読み込んだ
//   （手元の確認で 200MB を読み込んでから 401 を返した）。大きすぎる本文は読む前に断る（契約外の入力として bad_request）
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
app.use(
  "/api/*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(
        { code: "bad_request", message: "送る内容が大きすぎます", hint: errorText.bad_request.hint },
        errorStatus.bad_request as 400,
      ),
  }),
);

for (const [name, route] of Object.entries(api)) {
  const handler = table[name as keyof typeof api];
  app.on(route.method, route.path, (c) => handler(c.req.raw));
}

// 契約にない道筋・想定外の失敗も、契約の ApiError の形で返す
app.notFound((c) => c.json({ code: "not_found", ...errorText.not_found }, errorStatus.not_found as 404));
app.onError((e) => {
  const { status, body } = toApiError(e);
  return Response.json(body, { status });
});

export default app;
