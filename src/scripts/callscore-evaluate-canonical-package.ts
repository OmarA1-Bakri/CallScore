import { readFileSync } from "node:fs";
import {
  evaluateCanonicalOperationalPackage,
  type CanonicalOperationalPackageInput,
} from "../lib/autonomy/canonical-operational-runtime";

const FAILED_EVALUATION = {
  status: "blocked" as const,
  blockers: ["canonical_operational_package_evaluation_failed"],
};

function requiredArgument(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

function main(argv = process.argv.slice(2)): void {
  try {
    const packagePath = requiredArgument(argv, "--package");
    const expectedChannel = requiredArgument(argv, "--expected-channel");
    const expectedPayloadHash = requiredArgument(argv, "--expected-payload-hash");
    const evaluationNow = requiredArgument(argv, "--evaluation-now");
    if (!Number.isFinite(Date.parse(evaluationNow))) throw new Error("--evaluation-now must be a valid timestamp");

    const packageDocument = JSON.parse(readFileSync(packagePath, "utf8")) as unknown;
    if (!packageDocument || typeof packageDocument !== "object" || Array.isArray(packageDocument)) {
      throw new Error("--package must contain a JSON object");
    }
    const evaluation = evaluateCanonicalOperationalPackage({
      ...(packageDocument as CanonicalOperationalPackageInput),
      expected_channel: expectedChannel,
      expected_payload_hash: expectedPayloadHash,
      evaluation_now: evaluationNow,
    });
    process.stdout.write(`${JSON.stringify(evaluation)}\n`);
    if (evaluation.status !== "approved") process.exitCode = 1;
  } catch {
    process.stdout.write(`${JSON.stringify(FAILED_EVALUATION)}\n`);
    process.exitCode = 1;
  }
}

main();
