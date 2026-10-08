import { analyze } from "@/server/analyze";
import { handle } from "@/server/route";

export const POST = handle("analyze", analyze);
