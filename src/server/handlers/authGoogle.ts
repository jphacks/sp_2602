// Google の ID トークンを確かめて、合言葉（Session）を出す（lead の担当）。初めての人は登録する。role はペアリングまで null。
// MOCK=1 は contracts/fixtures.ts の mockSessions（idToken がキー）。
import { mockSessions } from "../../../contracts/fixtures";
import { isMock } from "../env";
import { AppError } from "../errors";
import { handle } from "../route";

export default handle("authGoogle", async (req) => {
  if (isMock()) {
    const session = mockSessions[req.idToken as keyof typeof mockSessions];
    if (!session) throw new AppError("unauthorized", "Google のログインを確かめられませんでした");
    return session;
  }
  // TODO(lead): Google の ID トークンの検証（使う部品は同期点1 で決める。open.md）と、家族・合言葉の表への登録（back-a）
  throw new AppError("upstream_failed", "Google ログインはまだ準備中です", "MOCK=1 で試してください");
});
