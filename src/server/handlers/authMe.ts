// 今の合言葉の持ち主を返す（lead の担当）。合言葉の確認は route.ts（auth: "signedIn"）が済ませている。
import { AppError } from "../errors";
import { handle } from "../route";

export default handle("authMe", async (_req, { caller }) => {
  if (!caller) throw new AppError("unauthorized");
  return caller;
});
