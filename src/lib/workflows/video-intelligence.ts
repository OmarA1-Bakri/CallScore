import { WorkflowRuntime, type ControlPlaneRepository, type JsonRecord, type JsonValue, type WorkflowDefinition, type WorkflowRunResult } from "../control-plane";
import { extractCandidateCalls } from "../video-intelligence/extract-candidate-calls";
import { normalizeCalls } from "../video-intelligence/normalize-calls";
import { segmentTranscript } from "../video-intelligence/transcript-segments";
import type { CandidateCall, EvidenceValidationReport, NormalizedCall, TranscriptSegment, VideoIntelligenceInput } from "../video-intelligence/types";
import { validateEvidence } from "../video-intelligence/validate-evidence";

export interface VideoIntelligenceWorkflowOptions {
  readonly repository: ControlPlaneRepository;
  readonly idempotencyKey?: string;
  readonly triggeredBy?: string | null;
}

export interface VideoIntelligenceWorkflowState {
  segments: readonly TranscriptSegment[];
  candidateCalls: readonly CandidateCall[];
  normalizedCalls: readonly NormalizedCall[];
  validationReport: EvidenceValidationReport | null;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toJsonRecord(value: unknown): JsonRecord {
  return toJsonValue(value) as JsonRecord;
}

export function createVideoIntelligenceWorkflow(
  input: VideoIntelligenceInput,
  state: VideoIntelligenceWorkflowState = {
    segments: [],
    candidateCalls: [],
    normalizedCalls: [],
    validationReport: null,
  },
): WorkflowDefinition {
  return {
    name: "video_intelligence_workflow",
    version: "v1",
    entityType: "video",
    maxIterations: 20,
    nodes: [
      {
        id: "fetch_video_metadata",
        type: "deterministic",
        run: () => ({
          outputArtifact: {
            artifactType: "video_metadata",
            schemaVersion: "callscore.video_metadata.v1",
            json: {
              video_id: input.videoId,
              title: input.title,
              creator_handle: input.creatorHandle ?? null,
              published_at: input.publishedAt ?? null,
            },
          },
        }),
      },
      {
        id: "load_transcript",
        type: "deterministic",
        dependsOn: ["fetch_video_metadata"],
        run: () => ({
          outputArtifact: {
            artifactType: "transcript_raw",
            schemaVersion: "callscore.transcript_raw.v1",
            json: {
              video_id: input.videoId,
              transcript: input.transcript,
              char_count: input.transcript.length,
            },
          },
        }),
      },
      {
        id: "segment_transcript",
        type: "deterministic",
        dependsOn: ["load_transcript"],
        run: () => {
          state.segments = segmentTranscript(input.transcript);
          return {
            outputArtifact: {
              artifactType: "transcript_segments",
              schemaVersion: "callscore.transcript_segments.v1",
              json: toJsonValue({ video_id: input.videoId, segments: state.segments }),
            },
          };
        },
      },
      {
        id: "extract_candidate_calls",
        type: "llm_structured",
        dependsOn: ["segment_transcript"],
        maxAttempts: 1,
        run: async (ctx) => {
          state.candidateCalls = extractCandidateCalls(state.segments);
          await ctx.repository.recordAgentInvocation({
            workflowRunId: ctx.workflowRun.id,
            nodeRunId: ctx.nodeRun.id,
            role: "video_intelligence_candidate_extractor",
            provider: "deterministic_fixture",
            model: "rule-based-v1",
            promptVersion: "callscore.video_intelligence.v1",
            inputArtifactIds: ctx.inputArtifactIds,
            status: "completed",
          });
          return {
            outputArtifact: {
              artifactType: "candidate_calls",
              schemaVersion: "callscore.candidate_calls.v1",
              json: toJsonValue({ video_id: input.videoId, calls: state.candidateCalls }),
            },
          };
        },
      },
      {
        id: "normalize_calls",
        type: "deterministic",
        dependsOn: ["extract_candidate_calls"],
        run: () => {
          state.normalizedCalls = normalizeCalls(state.candidateCalls);
          return {
            outputArtifact: {
              artifactType: "normalized_calls",
              schemaVersion: "callscore.normalized_calls.v1",
              json: toJsonValue({ video_id: input.videoId, calls: state.normalizedCalls }),
            },
          };
        },
      },
      {
        id: "validate_evidence",
        type: "deterministic",
        dependsOn: ["normalize_calls"],
        run: () => {
          state.validationReport = validateEvidence(state.normalizedCalls, state.segments);
          return {
            outputArtifact: {
              artifactType: "validation_report",
              schemaVersion: "callscore.validation_report.v1",
              json: toJsonValue(state.validationReport),
            },
          };
        },
      },
      {
        id: "approval_gate_if_required",
        type: "approval",
        dependsOn: ["validate_evidence"],
        run: async (ctx) => {
          if (!state.validationReport?.requiresApproval) return { status: "completed", reason: "no_approval_required" };
          await ctx.repository.requestApprovalGate({
            workflowRunId: ctx.workflowRun.id,
            nodeRunId: ctx.nodeRun.id,
            gateType: "video_intelligence_review",
            reason: "low_confidence_or_evidence_issue",
            metadata: toJsonRecord({
              video_id: input.videoId,
              issues: state.validationReport.issues,
            }),
          });
          return { status: "awaiting_approval", reason: "video_intelligence_review_required" };
        },
      },
    ],
  };
}

export async function runVideoIntelligenceWorkflow(
  input: VideoIntelligenceInput,
  options: VideoIntelligenceWorkflowOptions,
): Promise<WorkflowRunResult & { readonly state: VideoIntelligenceWorkflowState }> {
  const state: VideoIntelligenceWorkflowState = {
    segments: [],
    candidateCalls: [],
    normalizedCalls: [],
    validationReport: null,
  };
  const runtime = new WorkflowRuntime(options.repository);
  const result = await runtime.run(createVideoIntelligenceWorkflow(input, state), {
    entityId: input.videoId,
    triggeredBy: options.triggeredBy ?? null,
    idempotencyKey: options.idempotencyKey,
  });
  return { ...result, state };
}
