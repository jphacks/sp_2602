// アプリのまとめ（Metro）の設定。Expo の既定に1つだけ足す。
// 足したもの: 相対 import の "./errors.js" が見つからなければ、拡張子なし（"./errors" → errors.ts）で探し直す。
// なぜ: contracts/ はサーバと共有していて、Vercel の Node（ESM）は import に ".js" が要る（中身は .ts のまま）。
//   TypeScript はこの書き方を errors.ts に読み替えるが、Metro は読み替えないので、アプリのまとめが止まった。
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const resolveBefore = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveBefore ?? context.resolveRequest;
  try {
    return resolve(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js"))
      return resolve(context, moduleName.slice(0, -".js".length), platform);
    throw error;
  }
};

module.exports = config;
