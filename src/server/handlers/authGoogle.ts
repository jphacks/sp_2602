// C1: Google の ID トークンを確かめて、合言葉（Session）を出す。初めての人は登録する（role は null。QR の紐づけで決まる）。
// "mock-" で始まる idToken は MOCK=1 のときだけ受け付ける（Google Cloud の登録が済むまでの開発用。contracts/fixtures.ts の mockLogins）。
// 回数の上限（src/server/rate-limit.ts。セキュリティ検査 F-5）: IP ごとに1分20回（Google の確認より先に数える）、同じ人ごとに1分10回。
// こえたら 429 rate_limited

import { verifyGoogleIdToken } from "../auth/google.js";
import { signInGoogle, signInMock } from "../auth.js";
import { isMock } from "../env.js";
import { AppError } from "../errors.js";
import { AUTH_IP_LIMIT, AUTH_SUBJECT_LIMIT, clientIp, countCall } from "../rate-limit.js";
import { handle } from "../route.js";

export default handle("authGoogle", async (req, { request }) => {
  const ip = clientIp(request);
  if (ip) await countCall(AUTH_IP_LIMIT, ip);
  if (req.idToken.startsWith("mock-")) {
    if (!isMock())
      throw new AppError("unauthorized", "開発用のログインはこのサーバでは使えません", "Google でログインしてください");
    await countCall(AUTH_SUBJECT_LIMIT, `mock:${req.idToken}`);
    return signInMock(req.idToken);
  }
  const who = await verifyGoogleIdToken(req.idToken);
  await countCall(AUTH_SUBJECT_LIMIT, `google:${who.sub}`);
  return signInGoogle(who.sub, who.name);
});
