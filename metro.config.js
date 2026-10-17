// アプリのまとめ（Metro）の設定。Expo の既定に2つだけ足す。
// 足したもの1: 相対 import の "./errors.js" が見つからなければ、拡張子なし（"./errors" → errors.ts）で探し直す。
// なぜ: contracts/ はサーバと共有していて、Vercel の Node（ESM）は import に ".js" が要る（中身は .ts のまま）。
//   TypeScript はこの書き方を errors.ts に読み替えるが、Metro は読み替えないので、アプリのまとめが止まった。
// 足したもの2: サブエージェントの作業フォルダ（.claude/worktrees）を読まない（blockList）。
// なぜ: 作業フォルダはリポジトリの中にでき、その node_modules は本体の node_modules へのつなぎ（junction）なので、
//   Metro が全部を2重に読みに行き、CPU 100% で応答しなくなった（2026-10-18、2回）。
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

const blockBefore = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(blockBefore) ? blockBefore : blockBefore ? [blockBefore] : []),
  /[\\/]\.claude[\\/]worktrees[\\/].*/,
];

module.exports = config;
