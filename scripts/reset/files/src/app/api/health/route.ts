import { handle } from "@/server/route";

export const GET = handle("health", async () => ({ ok: true, mock: process.env.MOCK === "1" }));
