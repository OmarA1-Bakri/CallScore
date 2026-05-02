import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SecretHygieneArgs {
  readonly json: boolean;
}

const FORBIDDEN_LOCAL_SECRET_FILES = [
  ".tmp/.apify-token.local",
] as const;

const REQUIRED_GITIGNORE_PATTERNS = [
  ".env",
  ".env.local",
  ".tmp/",
] as const;

export function parseSecretHygieneArgs(argv = process.argv.slice(2)): SecretHygieneArgs {
  return { json: argv.includes("--json") };
}

export function checkSecretHygiene(root = process.cwd()): {
  readonly ok: boolean;
  readonly forbiddenFiles: readonly string[];
  readonly missingGitignorePatterns: readonly string[];
} {
  const forbiddenFiles = FORBIDDEN_LOCAL_SECRET_FILES.filter((file) => existsSync(resolve(root, file)));
  const gitignorePath = resolve(root, ".gitignore");
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const missingGitignorePatterns = REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !gitignore.includes(pattern));

  return {
    ok: forbiddenFiles.length === 0 && missingGitignorePatterns.length === 0,
    forbiddenFiles,
    missingGitignorePatterns,
  };
}

export function main(argv = process.argv.slice(2)): void {
  const args = parseSecretHygieneArgs(argv);
  const result = checkSecretHygiene();
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Secret hygiene: ${result.ok ? "ok" : "blocked"}`);
    for (const file of result.forbiddenFiles) console.log(`  forbidden local secret file exists: ${file}`);
    for (const pattern of result.missingGitignorePatterns) console.log(`  .gitignore missing pattern: ${pattern}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main();
