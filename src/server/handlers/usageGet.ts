// C6: 親の画面の利用記録。日ごとに一番新しい測定（C8）と、その日の上限（D6）を返す（連携済みの子どもだけ。route.ts が確かめる）。
import { readParentUsage } from "../../../backend/src/db/usage-read.js";
import { db } from "../db/index.js";
import { handle } from "../route.js";

export default handle("usageGet", async (req) => readParentUsage(await db(), req));
