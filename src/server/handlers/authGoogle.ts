// C1: Google の ID トークンを確かめて、合言葉（Session）を出す。初めての人は登録する（role は null。QR の紐づけで決まる）。
// "mock-" で始まる idToken は MOCK=1 のときだけ受け付ける（Google Cloud の登録が済むまでの開発用。contracts/fixtures.ts の mockLogins）。

import { signInGoogle } from "../auth.js";
import { verifyGoogleIdToken } from "../auth/google.js";
import { isMock } from "../env.js";
import { AppError } from "../errors.js";
import { getStore } from "../mock/store.js";
import { handle } from "../route.js";

export default handle("authGoogle", async (req) => {
  if (req.idToken.startsWith("mock-")) {
    if (!isMock())
      throw new AppError("unauthorized", "開発用のログインはこのサーバでは使えません", "Google でログインしてください");
    return getStore().signInMock(req.idToken);
  }
  const who = await verifyGoogleIdToken(req.idToken);
  return signInGoogle(who.sub, who.name);
});
