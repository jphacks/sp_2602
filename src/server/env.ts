// 環境の読み取り（lead の担当）。MOCK=1 のときは外部サービスや DB を使わず、contracts/fixtures.ts の固定データを返す。
export const isMock = () => process.env.MOCK === "1";
