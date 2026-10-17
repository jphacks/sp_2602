// KIT-STUB: 契約と一緒に lead が置いた仮の API。担当者が本物に置き換えるときはこの行ごと書き換える。
import { fixtures } from "../../../contracts/fixtures";
import { AppError } from "../errors";
import { handle } from "../route";

export default handle("pairStart", async () => {
  const f = (fixtures as Record<string, unknown>).pairStart;
  if (f === undefined) throw new AppError("internal", "まだ実装されていません（仮の API）");
  return f as never;
});
