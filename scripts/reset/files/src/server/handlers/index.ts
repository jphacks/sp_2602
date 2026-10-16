// 契約（contracts/api.ts）の API 1本につき1つ、ここから export する。名前は契約の API 名と同じにする。
// 足りないと src/server/app.ts の型検査（npm run typecheck）が落ちる。npm run kit:stub は仮の処理とこの1行を足す。
export { default as health } from "./health";
