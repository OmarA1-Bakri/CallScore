const BANNED_TERMS = [
  "scam",
  "fraud",
  "liar",
  "criminal",
  "guaranteed",
  "you should buy",
  "you should sell",
  "this is financial advice",
  "is financial advice",
] as const;

export interface ScriptValidationResult {
  readonly ok: boolean;
  readonly wordCount: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateScriptText(text: string, options: { readonly minWords?: number; readonly maxWords?: number } = {}): ScriptValidationResult {
  const normalized = text.toLowerCase();
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const term of BANNED_TERMS) {
    if (normalized.includes(term)) errors.push(`banned_term:${term}`);
  }
  const wordCount = countWords(text);
  if (options.minWords !== undefined && wordCount < options.minWords) errors.push(`too_short:${wordCount}<${options.minWords}`);
  if (options.maxWords !== undefined && wordCount > options.maxWords) errors.push(`too_long:${wordCount}>${options.maxWords}`);
  if (!/callscore/i.test(text)) warnings.push("missing_callscore_brand_reference");
  return { ok: errors.length === 0, wordCount, errors, warnings };
}
