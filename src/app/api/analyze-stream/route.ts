import { analyzeStream } from "@/server/analyze";
import { handleStream } from "@/server/route";

export const POST = handleStream("analyzeStream", analyzeStream);
