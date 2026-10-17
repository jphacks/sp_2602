// 合言葉・QR の番号は、DB にはこのハッシュだけを残す（DB の中身が漏れても、そのまま使えないように）
import { createHash } from "node:crypto";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
