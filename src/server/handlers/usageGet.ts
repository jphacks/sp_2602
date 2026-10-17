// C6: read the latest per-date C8 snapshot and the persisted D6 limit for a linked child.
import { readParentUsage } from "../../../backend/src/db/usage-read.js";
import { db } from "../db/index.js";
import { isMock } from "../env.js";
import { getStore } from "../mock/store.js";
import { handle } from "../route.js";

export default handle("usageGet", async (req) =>
  isMock() ? getStore().usageView(req.childId, req.from, req.to) : readParentUsage(await db(), req),
);
