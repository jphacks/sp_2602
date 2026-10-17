// C6: read the latest per-date C8 snapshot and the persisted D6 limit for a linked child.
import { readParentUsage } from "../../../backend/src/db/usage-read";
import { db } from "../db";
import { isMock } from "../env";
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("usageGet", async (req) =>
  isMock() ? getStore().usageView(req.childId, req.from, req.to) : readParentUsage(await db(), req),
);
