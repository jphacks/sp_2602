import { readChildConfigSnapshot } from "../../../backend/src/db/config-snapshot.js";
import { db } from "../db/index.js";

/** The existing API uses calculationVersion: 0 when no result matches current C10 inputs. */
export async function currentC10CalculationVersion(childId: string): Promise<number> {
  const snapshot = await readChildConfigSnapshot(await db(), childId);
  return snapshot.calculation?.matchesC10InputVersion ? snapshot.calculation.version : 0;
}
