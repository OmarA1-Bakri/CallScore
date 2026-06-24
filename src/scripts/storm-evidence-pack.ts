import dotenv from "dotenv";
import { runPipelineGuardAudit } from "../lib/pipeline-guard-audit";
import { loadTransitionStatesArtifact, selectStormTransition, buildStormEvidencePack } from "../lib/storm/storm-evidence-loader";
import { buildStormClaimMap } from "../lib/storm/storm-claim-map";
import { buildStormContradictions } from "../lib/storm/storm-perspectives";
import { buildStormYoutubeContext } from "../lib/storm/storm-youtube-context";
import { writeStormArtifacts } from "../lib/storm/storm-report";

dotenv.config({ path: ".env" + ".hermes", quiet: true });
if (!process.env.DATABASE_PROVIDER) process.env.DATABASE_PROVIDER = "postgres";

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || argv[index + 1] === undefined) return null;
  return argv[index + 1];
}
function positiveInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const creatorId = positiveInt(argValue(argv, "--creator-id"));
  const transitionArtifact = argValue(argv, "--transition-artifact") ?? ".tmp/transition/latest/states.json";
  const out = argValue(argv, "--out") ?? (creatorId ? `.tmp/storm/creator-${creatorId}` : ".tmp/storm/latest");

  const guard = await runPipelineGuardAudit();
  if (guard.core_pipeline_status === "blocked") throw new Error("core pipeline is blocked");

  const states = loadTransitionStatesArtifact(transitionArtifact);
  const transition = selectStormTransition(states, creatorId);
  const pack = await buildStormEvidencePack({ transition });
  const claims = buildStormClaimMap(pack);
  const contradictions = buildStormContradictions(pack);
  const youtube = buildStormYoutubeContext({ pack, claims, contradictions });
  writeStormArtifacts({ outDir: out, pack, claims, contradictions, youtube });

  console.log(JSON.stringify({
    out,
    creator_id: pack.creator_id,
    creator_name: pack.creator_name,
    state: pack.state,
    supporting_calls: pack.supporting_calls.length,
    contradicting_calls: pack.contradicting_calls.length,
    safe_claims: claims.filter((claim) => claim.public_safe).length,
    blocked_claims: claims.filter((claim) => !claim.public_safe).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
