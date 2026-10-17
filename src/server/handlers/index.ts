// 契約（contracts/api.ts）の API 1本につき1つ、ここから export する。名前は契約の API 名と同じにする。
// 足りないと src/server/app.ts の型検査（npm run typecheck）が落ちる。npm run kit:stub は仮の処理とこの1行を足す。
export { default as authGoogle } from "./authGoogle";
export { default as authMe } from "./authMe";
export { default as familyGet } from "./familyGet";
export { default as health } from "./health";
export { default as pairClaim } from "./pairClaim";
export { default as pairConfirm } from "./pairConfirm";
export { default as pairStart } from "./pairStart";
export { default as pairStatus } from "./pairStatus";
export { default as rulesGet } from "./rulesGet";
export { default as rulesSave } from "./rulesSave";
export { default as rulesSyncStream } from "./rulesSyncStream";
export { default as usageGet } from "./usageGet";
export { default as usageReport } from "./usageReport";
