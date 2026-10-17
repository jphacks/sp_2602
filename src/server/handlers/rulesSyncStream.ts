// 例（kit:reset で消える）: 子どもの端末が最新のルールを取りに来る。途中の様子を少しずつ返す（stream の使い方の見本）。
import { fixtures } from "../../../contracts/fixtures";
import { isMock } from "../env";
import { handleStream } from "../route";
import { getRules } from "../rules";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default handleStream("rulesSyncStream", async (req, emit, signal) => {
  if (isMock()) {
    for (const c of fixtures.rulesSyncStream.chunks) {
      if (signal.aborted) break;
      emit(c);
      await wait(Number(process.env.MOCK_STREAM_DELAY_MS ?? 400));
    }
    return { ...fixtures.rulesSyncStream.res, childId: req.childId };
  }
  emit({ text: "保護者の設定を読み込んでいます…" });
  const rules = await getRules(req.childId);
  emit({ text: `${rules.limits.length}つのアプリの制限を受け取りました。` });
  return rules;
});
