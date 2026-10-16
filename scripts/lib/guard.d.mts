export function findConflictMarkers(addedLines: string[]): string[];
export function isSecretPath(path: string): boolean;
export function isTestPath(path: string): boolean;
export function findTestSkips(addedLines: string[]): string[];
export function checkCommand(command: string): { level: "deny" | "ask"; reason: string } | null;
