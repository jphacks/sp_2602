import { isMock } from "@/server/analyze";
import { handle } from "@/server/route";

export const GET = handle("health", async () => ({ ok: true, mock: isMock() }));
