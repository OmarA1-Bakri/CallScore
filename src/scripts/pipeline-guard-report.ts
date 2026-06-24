import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import dotenv from "dotenv";
import { runPipelineGuardAudit } from "../lib/pipeline-guard-audit";

dotenv.config({ path: ".env" + ".hermes", quiet: true });
if (!process.env.DATABASE_PROVIDER) process.env.DATABASE_PROVIDER = "postgres";

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || argv[index + 1] === undefined) return null;
  return argv[index + 1];
}
async function main(): Promise<void> {
  const out = argValue(process.argv.slice(2), "--out");
  const audit = await runPipelineGuardAudit();
  const text = `${JSON.stringify(audit, null, 2)}\n`;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text);
  }
  process.stdout.write(text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
