// サーバの入口。契約（contracts/api.ts）の API の表どおりに、handlers/ の処理を Hono につなぐ。
// 手元は npm run dev:server（src/server/dev.ts）、Vercel では最上位の server.ts がこれを公開する。
// パスの手書きはしない。API を足すときは契約に足し、handlers/ に同じ名前の処理を置いて index.ts から export する。
import { Hono } from "hono";
import { api } from "../../contracts/api";
import { errorStatus, errorText } from "../../contracts/errors";
import { toApiError } from "./errors";
import * as handlers from "./handlers";

type Handler = (request: Request) => Promise<Response>;

// 契約にある API に処理が足りないと、ここで型エラーになる（npm run typecheck）。
const table: { [K in keyof typeof api]: Handler } = handlers;

const app = new Hono();

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
