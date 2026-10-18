// scripts/sync-kids-ui.mjs の型（tests/kids/sync-kids-ui.test.ts から書き換えの決まりを確かめるため）
export type RewriteContext = { hasKidsComponent: (rel: string) => boolean; hasKidsLib: (rel: string) => boolean };
export const DIRS: string[];
export const TEXT_MODULE: string;
export function header(rel: string): string;
export function rewriteSpecifier(spec: string, ctx: RewriteContext): { spec: string; error?: string };
export function rewriteSource(
  text: string,
  fileName: string,
  ctx: RewriteContext,
): { text: string; errors: string[]; specs: string[] };
