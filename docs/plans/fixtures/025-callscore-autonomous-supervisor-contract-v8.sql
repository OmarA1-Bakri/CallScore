-- Executable contract proof for production migration 025.
-- The fixture mirrors migration 024's live UUID channel_tasks key and runs only in one local transaction.
-- Production substitutes schema public and production role names without weakening any ACL/function contract.
BEGIN;

CREATE SCHEMA callscore_plan_contract;
SET LOCAL search_path = callscore_plan_contract, pg_catalog;

CREATE ROLE callscore_plan_function_owner NOLOGIN;
CREATE ROLE callscore_plan_runtime NOLOGIN;
CREATE ROLE callscore_plan_policy_writer NOLOGIN;
CREATE ROLE callscore_plan_enqueue NOLOGIN;
CREATE ROLE callscore_plan_observer NOLOGIN;
CREATE ROLE callscore_plan_report_verifier NOLOGIN;
CREATE ROLE callscore_plan_review_identity_attestor NOLOGIN;

CREATE TYPE callscore_workflow_state AS ENUM (
  'QUEUED','HEAD_PLANNING','CHILDREN_RUNNING','HEAD_SYNTHESIS',
  'QUALITY_EVALUATION','REVISION','READY','EXECUTING','PROVIDER_VERIFIED',
  'OUTCOME_PENDING','OUTCOME_MEASURED','LEARNING_RECORDED','COMPLETE','RETRY','FAILED'
);
CREATE TYPE callscore_execution_class AS ENUM (
  'OWNED_PUBLIC_MUTATION','INTERNAL_ARTIFACT','READ_ONLY_OBSERVATION','RESTRICTED_DRAFT'
);
CREATE TYPE callscore_achievement_class AS ENUM ('OBSERVED','DRAFTED','EXECUTED','VERIFIED');
CREATE TYPE callscore_join_status AS ENUM (
  'DISPATCH_INTENT','SPAWNED','RUNNING','SUCCEEDED','FAILED','TIMED_OUT',
  'CANCELLED','ORPHANED','ACCEPTED','REJECTED'
);
CREATE TYPE callscore_evaluation_decision AS ENUM ('ACCEPT','REVISE','REJECT');
CREATE TYPE callscore_provider_state AS ENUM (
  'INTENT','CLAIMED','DISPATCHING','SUBMITTED','CONFIRMED_NOT_PERFORMED','UNKNOWN',
  'VERIFIED','FAILED_RETRYABLE','FAILED_TERMINAL'
);
CREATE TYPE callscore_authority_source AS ENUM ('READY_PUBLIC_OWNED_POLICY','OPERATOR_GATE');

-- Exact migration-024 compatibility fixtures.
CREATE TABLE agent_instances (
  agent_id text PRIMARY KEY
);
CREATE TABLE channel_tasks (
  id uuid PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agent_instances(agent_id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  task_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','running','succeeded','failed','blocked','cancelled','draft_only')),
  priority integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  idempotency_key text NOT NULL UNIQUE,
  payload_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_uri text,
  blocker text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE autonomy_artifacts (
  artifact_id uuid PRIMARY KEY,
  artifact_kind text NOT NULL,
  artifact_uri text NOT NULL UNIQUE,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  media_type text NOT NULL,
  created_by_agent_id text NOT NULL,
  verified_by_agent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (artifact_kind, content_sha256),
  CHECK (artifact_uri LIKE '/%' AND artifact_uri NOT LIKE '%/../%'),
  CHECK (created_by_agent_id<>verified_by_agent_id)
);

CREATE TABLE verified_evidence_bindings (
  binding_id uuid PRIMARY KEY,
  subject_stream_id text NOT NULL,
  sequence_no bigint NOT NULL CHECK (sequence_no>0),
  evidence_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  evidence_sha256 char(64) NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  subject_sha256 char(64) NOT NULL CHECK (subject_sha256 ~ '^[0-9a-f]{64}$'),
  validation_schema text NOT NULL,
  validation_status text NOT NULL CHECK (validation_status='PASS'),
  verifier_agent_id text NOT NULL,
  verifier_context jsonb NOT NULL CHECK (jsonb_typeof(verifier_context)='object'),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous_record_hash bytea,
  record_hash bytea,
  UNIQUE (evidence_artifact_id,subject_kind,subject_id,subject_sha256,validation_schema),
  UNIQUE (subject_stream_id,sequence_no),
  CHECK (subject_stream_id=subject_kind||':'||subject_id),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32),
  CHECK (length(subject_kind)>0 AND length(subject_id)>0 AND length(validation_schema)>0)
);

CREATE TABLE autonomy_activation_fence (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fenced boolean NOT NULL DEFAULT true,
  fence_version bigint NOT NULL DEFAULT 0 CHECK (fence_version >= 0),
  controlled_reason_code text NOT NULL,
  updated_by_role text NOT NULL,
  active_deployment_subject_sha256 char(64) CHECK (active_deployment_subject_sha256 IS NULL OR active_deployment_subject_sha256 ~ '^[0-9a-f]{64}$'),
  activation_approval_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO autonomy_activation_fence(singleton,fenced,controlled_reason_code,updated_by_role)
VALUES (true,true,'migration_default_fail_closed','migration_admin');

CREATE TABLE autonomy_workflows (
  workflow_id uuid PRIMARY KEY,
  workflow_run_id uuid NOT NULL UNIQUE,
  source_channel_task_id uuid UNIQUE REFERENCES channel_tasks(id) ON DELETE RESTRICT,
  execution_class callscore_execution_class NOT NULL,
  workflow_state callscore_workflow_state NOT NULL DEFAULT 'QUEUED',
  achievement_class callscore_achievement_class NOT NULL DEFAULT 'OBSERVED',
  head_agent_id text NOT NULL,
  channel text NOT NULL,
  task_type text NOT NULL,
  policy_version text NOT NULL,
  input_payload jsonb NOT NULL,
  input_payload_sha256 char(64) NOT NULL CHECK (input_payload_sha256 ~ '^[0-9a-f]{64}$'),
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  lease_owner text,
  lease_token uuid,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_heartbeat_seq bigint NOT NULL DEFAULT 0 CHECK (lease_heartbeat_seq >= 0),
  lease_expires_at timestamptz,
  previous_executable_state callscore_workflow_state,
  revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 3),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 20),
  retry_at timestamptz,
  checkpoint_namespace text NOT NULL,
  checkpoint_thread_id text NOT NULL UNIQUE,
  terminal_reason_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (checkpoint_thread_id = 'callscore-task:' || workflow_id::text),
  CHECK ((lease_owner IS NULL) = (lease_token IS NULL)),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK (workflow_state <> 'RETRY' OR (retry_at IS NOT NULL AND previous_executable_state IS NOT NULL)),
  CHECK (workflow_state NOT IN ('COMPLETE','FAILED') OR terminal_reason_code IS NOT NULL),
  CHECK (workflow_state <> 'COMPLETE' OR
    (execution_class='OWNED_PUBLIC_MUTATION' AND achievement_class='VERIFIED') OR
    (execution_class='READ_ONLY_OBSERVATION' AND achievement_class='OBSERVED') OR
    (execution_class IN ('RESTRICTED_DRAFT','INTERNAL_ARTIFACT') AND achievement_class='DRAFTED'))
);
CREATE INDEX autonomy_workflows_runnable_idx
  ON autonomy_workflows(workflow_state,retry_at,created_at)
  WHERE workflow_state IN ('QUEUED','RETRY');

CREATE TABLE legacy_channel_task_migration_snapshots (
  channel_task_id uuid PRIMARY KEY REFERENCES channel_tasks(id) ON DELETE RESTRICT,
  original_status text NOT NULL,
  original_row jsonb NOT NULL,
  original_row_sha256 char(64) NOT NULL CHECK (original_row_sha256 ~ '^[0-9a-f]{64}$'),
  migration_disposition text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Each append-only stream has a DB-owned sequence and hash chain.
CREATE FUNCTION set_ledger_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE
  stream_column text := TG_ARGV[0];
  sequence_column text := TG_ARGV[1];
  stream_value text;
  supplied_sequence bigint;
  prior_sequence bigint;
  prior_hash bytea;
  canonical_payload jsonb;
BEGIN
  IF TG_TABLE_SCHEMA <> 'callscore_plan_contract' THEN
    RAISE EXCEPTION 'unexpected ledger schema %', TG_TABLE_SCHEMA USING ERRCODE='55000';
  END IF;
  stream_value := to_jsonb(NEW) ->> stream_column;
  supplied_sequence := (to_jsonb(NEW) ->> sequence_column)::bigint;
  IF stream_value IS NULL OR supplied_sequence IS NULL OR supplied_sequence < 1 THEN
    RAISE EXCEPTION 'ledger stream and positive sequence are required' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ':' || stream_value, 0));
  EXECUTE format(
    'SELECT %I, record_hash FROM %I.%I WHERE %I::text = $1 ORDER BY %I DESC LIMIT 1',
    sequence_column, TG_TABLE_SCHEMA, TG_TABLE_NAME, stream_column, sequence_column
  ) INTO prior_sequence, prior_hash USING stream_value;
  IF supplied_sequence <> COALESCE(prior_sequence,0) + 1 THEN
    RAISE EXCEPTION 'non-monotonic ledger sequence: expected %, got %', COALESCE(prior_sequence,0)+1, supplied_sequence USING ERRCODE='23514';
  END IF;
  NEW.previous_record_hash := prior_hash;
  canonical_payload := to_jsonb(NEW) - ARRAY['previous_record_hash','record_hash'];
  NEW.record_hash := sha256(convert_to(canonical_payload::text || COALESCE(encode(prior_hash,'hex'),''), 'UTF8'));
  RETURN NEW;
END;
$$;

CREATE FUNCTION reject_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE='55000';
END;
$$;

CREATE FUNCTION reject_projection_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  RAISE EXCEPTION 'projection table % rejects DELETE', TG_TABLE_NAME USING ERRCODE='55000';
END;
$$;

CREATE TABLE autonomy_workflow_transitions (
  transition_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  from_state callscore_workflow_state NOT NULL,
  to_state callscore_workflow_state NOT NULL,
  from_state_version bigint NOT NULL CHECK (from_state_version >= 0),
  to_state_version bigint NOT NULL CHECK (to_state_version = from_state_version + 1),
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  controlled_reason_code text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, sequence_no),
  UNIQUE (workflow_id, to_state_version),
  CHECK (from_state <> to_state),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

-- Workflow lease ownership has a separate append-only chain because a same-state
-- resume/reclaim must not be forged as a lifecycle transition.
CREATE TABLE autonomy_workflow_lease_events (
  lease_event_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  state_version bigint NOT NULL CHECK (state_version >= 0),
  lease_generation bigint NOT NULL CHECK (lease_generation > 0),
  prior_lease_owner text,
  lease_owner text NOT NULL,
  lease_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  controlled_reason_code text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,sequence_no),
  UNIQUE (workflow_id,lease_generation),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE autonomy_retry_events (
  retry_event_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no>0),
  retry_attempt integer NOT NULL CHECK (retry_attempt>0),
  retry_phase text NOT NULL CHECK (retry_phase IN ('SCHEDULED','RESUMED','EXHAUSTED')),
  prior_executable_state callscore_workflow_state NOT NULL,
  prior_state_version bigint NOT NULL CHECK (prior_state_version>=0),
  prior_lease_generation bigint NOT NULL CHECK (prior_lease_generation>0),
  retry_at timestamptz NOT NULL,
  controlled_reason_code text NOT NULL,
  exact_prior_executable_snapshot jsonb NOT NULL CHECK (jsonb_typeof(exact_prior_executable_snapshot)='object'),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(workflow_id,sequence_no),
  UNIQUE(workflow_id,retry_attempt,retry_phase),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE canonical_policy_snapshots (
  policy_snapshot_id uuid PRIMARY KEY,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  policy_record_id text NOT NULL,
  policy_commit_sha char(40) NOT NULL CHECK (policy_commit_sha ~ '^[0-9a-f]{40}$'),
  registry_sha256 char(64) NOT NULL CHECK (registry_sha256 ~ '^[0-9a-f]{64}$'),
  registry_version text NOT NULL,
  channel text NOT NULL,
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  mutation_family text NOT NULL,
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  readiness_status text NOT NULL CHECK (readiness_status='READY_PUBLIC_OWNED'),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL CHECK (valid_until > valid_from),
  rollback_contract jsonb NOT NULL CHECK (jsonb_typeof(rollback_contract)='object'),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (policy_record_id, sequence_no),
  UNIQUE (policy_commit_sha, policy_record_id, account_scope_hash, provider_tool, action_name),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE canonical_receipt_evidence (
  receipt_evidence_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  receipt_schema text NOT NULL,
  receipt_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_agent_id text NOT NULL,
  status text NOT NULL CHECK (status='PASS'),
  verified_at timestamptz NOT NULL,
  stale_at timestamptz NOT NULL CHECK (stale_at > verified_at),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, sequence_no),
  UNIQUE (workflow_id, receipt_schema, receipt_sha256),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE provider_operation_intents (
  intent_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  publication_revision integer NOT NULL CHECK (publication_revision BETWEEN 0 AND 3),
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  mutation_family text NOT NULL,
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  payload_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  is_media boolean NOT NULL DEFAULT false,
  is_youtube boolean NOT NULL DEFAULT false,
  rollback_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, sequence_no),
  UNIQUE (intent_id,workflow_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256),
  CHECK (NOT is_youtube OR is_media),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE external_action_grants (
  grant_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  intent_id uuid NOT NULL REFERENCES provider_operation_intents(intent_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  authority_source callscore_authority_source NOT NULL,
  policy_snapshot_id uuid NOT NULL REFERENCES canonical_policy_snapshots(policy_snapshot_id) ON DELETE RESTRICT,
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  mutation_family text NOT NULL,
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  publication_revision integer NOT NULL CHECK (publication_revision BETWEEN 0 AND 3),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  issued_by_role text NOT NULL CHECK (issued_by_role='callscore_function_owner'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses=1),
  previous_record_hash bytea,
  record_hash bytea,
  UNIQUE (workflow_id, sequence_no),
  UNIQUE (grant_id,workflow_id,intent_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE external_action_grant_revocations (
  revocation_id uuid PRIMARY KEY,
  grant_id uuid NOT NULL UNIQUE REFERENCES external_action_grants(grant_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no=1),
  controlled_reason_code text NOT NULL,
  revoked_by_role text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

-- Canonical router/tool-inheritance requirements are durable before launch.
-- Delegation callers may resolve these rows but may not invent specialists.
CREATE TABLE workflow_specialist_requirements (
  requirement_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  requirement_stage text NOT NULL CHECK (requirement_stage IN ('SYNTHESIS_INPUT','POST_SYNTHESIS_EVALUATOR')),
  delegated_role text NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  canonical_child_agent_id text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  model text NOT NULL,
  provider text NOT NULL,
  allowed_capabilities jsonb NOT NULL CHECK (jsonb_typeof(allowed_capabilities)='object'),
  required_output_schema text NOT NULL,
  router_receipt_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  tool_inheritance_receipt_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  requirement_sha256 char(64) NOT NULL CHECK (requirement_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,revision_number,delegated_role,ordinal),
  UNIQUE (workflow_id,revision_number,requirement_sha256)
);

CREATE TABLE agent_delegations (
  delegation_id uuid PRIMARY KEY,
  requirement_id uuid NOT NULL UNIQUE REFERENCES workflow_specialist_requirements(requirement_id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  workflow_run_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  delegated_role text NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  canonical_child_agent_id text NOT NULL,
  child_execution_id uuid NOT NULL UNIQUE,
  expected_executable text NOT NULL,
  expected_uid integer NOT NULL CHECK (expected_uid >= 0),
  expected_cwd text NOT NULL,
  launch_status callscore_join_status NOT NULL,
  hermes_pid integer CHECK (hermes_pid IS NULL OR hermes_pid > 1),
  hermes_pgid integer CHECK (hermes_pgid IS NULL OR hermes_pgid > 1),
  hermes_start_ticks bigint CHECK (hermes_start_ticks IS NULL OR hermes_start_ticks >= 0),
  hermes_session_id text,
  usage_file_path text NOT NULL UNIQUE,
  stdout_file_path text NOT NULL UNIQUE,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  model text NOT NULL,
  provider text NOT NULL,
  allowed_capabilities jsonb NOT NULL,
  required_output_schema text NOT NULL,
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,workflow_run_id,revision_number,delegated_role,ordinal),
  UNIQUE (hermes_session_id),
  CHECK ((hermes_pid IS NULL)=(hermes_start_ticks IS NULL)),
  CHECK ((hermes_pid IS NULL)=(hermes_pgid IS NULL))
);

CREATE TABLE agent_delegation_events (
  event_id uuid PRIMARY KEY,
  delegation_id uuid NOT NULL REFERENCES agent_delegations(delegation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  status callscore_join_status NOT NULL,
  child_execution_id uuid NOT NULL,
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  hermes_pid integer,
  hermes_pgid integer,
  hermes_start_ticks bigint,
  hermes_session_id text,
  usage_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  usage_sha256 char(64) CHECK (usage_sha256 IS NULL OR usage_sha256 ~ '^[0-9a-f]{64}$'),
  output_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  output_sha256 char(64) CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (delegation_id,sequence_no),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

-- A head generation consumes one exact manifest containing every accepted
-- required child output. Relational members make omission/substitution visible.
CREATE TABLE child_join_manifests (
  join_manifest_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  manifest_artifact_id uuid NOT NULL UNIQUE REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  manifest_sha256 char(64) NOT NULL UNIQUE CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,revision_number)
);

CREATE TABLE child_join_manifest_members (
  join_manifest_id uuid NOT NULL REFERENCES child_join_manifests(join_manifest_id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES workflow_specialist_requirements(requirement_id) ON DELETE RESTRICT,
  delegation_id uuid NOT NULL REFERENCES agent_delegations(delegation_id) ON DELETE RESTRICT,
  output_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  output_sha256 char(64) NOT NULL CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (join_manifest_id,requirement_id),
  UNIQUE (join_manifest_id,delegation_id),
  UNIQUE (join_manifest_id,output_artifact_id)
);

CREATE TABLE runtime_experiments (
  experiment_id uuid PRIMARY KEY,
  agent_id text NOT NULL,
  channel text NOT NULL,
  task_type text NOT NULL,
  policy_version text NOT NULL,
  primary_metric text NOT NULL,
  eligibility_contract jsonb NOT NULL,
  bootstrap_contract jsonb NOT NULL,
  bootstrap_resamples integer NOT NULL CHECK (bootstrap_resamples=10000),
  bootstrap_seed bigint NOT NULL,
  minimum_control integer NOT NULL CHECK (minimum_control=30),
  minimum_treatment integer NOT NULL CHECK (minimum_treatment=30),
  minimum_observation_days integer NOT NULL CHECK (minimum_observation_days=14),
  minimum_outcome_relative_delta numeric(8,5) NOT NULL CHECK (minimum_outcome_relative_delta=0.10),
  minimum_quality_delta numeric(8,5) NOT NULL CHECK (minimum_quality_delta=0.03),
  minimum_ci_lower_bound numeric(8,5) NOT NULL CHECK (minimum_ci_lower_bound=0),
  minimum_provider_verification_rate numeric(8,5) NOT NULL CHECK (minimum_provider_verification_rate=1),
  maximum_safety_violations integer NOT NULL CHECK (maximum_safety_violations=0),
  treatment_ratio smallint NOT NULL CHECK (treatment_ratio=20),
  bundle_sha256 char(64) NOT NULL UNIQUE CHECK (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  review_receipt_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (agent_id,channel,task_type,policy_version,primary_metric,starts_at),
  UNIQUE (experiment_id,agent_id,channel,task_type,policy_version),
  CHECK (eligibility_contract=jsonb_build_object('require_terminal_complete',true,'require_outcome',true,'require_accepted_quality',true))
);

CREATE TABLE runtime_variants (
  variant_id uuid PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  agent_id text NOT NULL,
  channel text NOT NULL,
  task_type text NOT NULL,
  policy_version text NOT NULL,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  model text NOT NULL,
  provider text NOT NULL,
  parameters jsonb NOT NULL,
  tools_manifest_sha256 char(64) NOT NULL CHECK (tools_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  skills_manifest_sha256 char(64) NOT NULL CHECK (skills_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_from_variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  definition_sha256 char(64) NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (experiment_id,definition_sha256),
  UNIQUE (variant_id,agent_id,channel,task_type,policy_version),
  FOREIGN KEY (experiment_id,agent_id,channel,task_type,policy_version)
    REFERENCES runtime_experiments(experiment_id,agent_id,channel,task_type,policy_version) ON DELETE RESTRICT
);

CREATE TABLE runtime_cohorts (
  cohort_id uuid PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  cohort_name text NOT NULL CHECK (cohort_name IN ('CONTROL','TREATMENT')),
  variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (experiment_id,cohort_name),
  UNIQUE (experiment_id,cohort_id,variant_id)
);

CREATE TABLE runtime_registry (
  agent_id text NOT NULL,
  channel text NOT NULL,
  task_type text NOT NULL,
  policy_version text NOT NULL,
  active_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  rollback_variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  registry_version bigint NOT NULL DEFAULT 0 CHECK (registry_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (agent_id,channel,task_type,policy_version),
  FOREIGN KEY (active_variant_id,agent_id,channel,task_type,policy_version)
    REFERENCES runtime_variants(variant_id,agent_id,channel,task_type,policy_version) ON DELETE RESTRICT,
  FOREIGN KEY (rollback_variant_id,agent_id,channel,task_type,policy_version)
    REFERENCES runtime_variants(variant_id,agent_id,channel,task_type,policy_version) ON DELETE RESTRICT,
  CHECK (rollback_variant_id IS NULL OR rollback_variant_id <> active_variant_id)
);

CREATE TABLE runtime_variant_assignments (
  assignment_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  producer_agent_id text NOT NULL,
  delegated_role text NOT NULL,
  experiment_id uuid REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no>0),
  cohort_id uuid REFERENCES runtime_cohorts(cohort_id) ON DELETE RESTRICT,
  cohort_name text CHECK (cohort_name IN ('CONTROL','TREATMENT')),
  variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  assignment_bucket smallint CHECK (assignment_bucket BETWEEN 0 AND 99),
  assignment_ratio_control smallint CHECK (assignment_ratio_control=80),
  monitoring_promotion_event_id uuid,
  registry_version bigint NOT NULL CHECK (registry_version >= 0),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,producer_agent_id,delegated_role),
  UNIQUE (workflow_id,sequence_no),
  FOREIGN KEY (experiment_id,cohort_id,variant_id)
    REFERENCES runtime_cohorts(experiment_id,cohort_id,variant_id) ON DELETE RESTRICT,
  CHECK ((experiment_id IS NULL AND cohort_id IS NULL AND cohort_name IS NULL AND assignment_bucket IS NULL AND assignment_ratio_control IS NULL)
      OR (experiment_id IS NOT NULL AND cohort_id IS NOT NULL AND cohort_name IS NOT NULL AND assignment_bucket IS NOT NULL AND assignment_ratio_control=80)),
  CHECK (assignment_bucket IS NULL OR ((assignment_bucket < 80) = (cohort_name='CONTROL'))),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE generation_provenance (
  generation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  workflow_run_id uuid NOT NULL,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  delegation_id uuid REFERENCES agent_delegations(delegation_id) ON DELETE RESTRICT,
  join_manifest_id uuid REFERENCES child_join_manifests(join_manifest_id) ON DELETE RESTRICT,
  evaluated_generation_id uuid REFERENCES generation_provenance(generation_id) DEFERRABLE INITIALLY DEFERRED,
  producer_agent_id text NOT NULL,
  delegated_role text NOT NULL,
  channel text NOT NULL,
  task_type text NOT NULL,
  hermes_session_id text,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  resolved_prompt_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  prompt_secret_scan_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  prompt_contains_secret boolean NOT NULL DEFAULT false CHECK (prompt_contains_secret=false),
  model text NOT NULL,
  provider text NOT NULL,
  parameters jsonb NOT NULL,
  toolsets jsonb NOT NULL,
  tools_manifest_sha256 char(64) NOT NULL CHECK (tools_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  skills jsonb NOT NULL,
  skills_manifest_sha256 char(64) NOT NULL CHECK (skills_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  registry_version bigint NOT NULL CHECK (registry_version >= 0),
  policy_version text NOT NULL,
  experiment_id uuid REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES runtime_cohorts(cohort_id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  input_evidence_sha256 jsonb NOT NULL,
  output_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  output_sha256 char(64) NOT NULL CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  token_usage jsonb NOT NULL,
  cost_usd numeric(18,8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at),
  previous_record_hash bytea,
  record_hash bytea,
  UNIQUE (workflow_id,sequence_no),
  UNIQUE (generation_id,workflow_id,experiment_id,cohort_id,variant_id),
  FOREIGN KEY (experiment_id,cohort_id,variant_id)
    REFERENCES runtime_cohorts(experiment_id,cohort_id,variant_id) ON DELETE RESTRICT,
  CHECK ((delegated_role='head-synthesizer')=(join_manifest_id IS NOT NULL)),
  CHECK ((delegated_role IN ('evaluator','trust-reviewer'))=(evaluated_generation_id IS NOT NULL)),
  CHECK ((experiment_id IS NULL AND cohort_id IS NULL AND variant_id IS NOT NULL)
      OR (experiment_id IS NOT NULL AND cohort_id IS NOT NULL AND variant_id IS NOT NULL)),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE quality_evaluations (
  evaluation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  evaluator_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  evaluator_agent_id text NOT NULL,
  decision callscore_evaluation_decision NOT NULL,
  deterministic_gates jsonb NOT NULL,
  semantic_scores jsonb NOT NULL,
  similarity_score numeric(6,5) NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  similarity_threshold numeric(6,5) NOT NULL CHECK (similarity_threshold > 0 AND similarity_threshold <= 1),
  weighted_score numeric(6,5) NOT NULL CHECK (weighted_score BETWEEN 0 AND 1),
  acceptance_thresholds jsonb NOT NULL,
  controlled_reason_codes jsonb NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,sequence_no),
  CHECK (generation_id <> evaluator_generation_id),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE quality_gate_evidence (
  gate_evidence_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  gate_name text NOT NULL CHECK (gate_name IN ('claim_policy','canonical_receipts','secrets','originality','destination_fit')),
  passed boolean NOT NULL,
  evidence_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  verifier_agent_id text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,generation_id,gate_name),
  UNIQUE (workflow_id,sequence_no),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE artifact_revisions (
  revision_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no BETWEEN 1 AND 3),
  source_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES quality_evaluations(evaluation_id) ON DELETE RESTRICT,
  revised_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 1 AND 3),
  controlled_reason_codes jsonb NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,sequence_no),
  CHECK (sequence_no=revision_number),
  CHECK (source_generation_id <> revised_generation_id),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE provider_operations (
  operation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  accepted_evaluation_id uuid NOT NULL REFERENCES quality_evaluations(evaluation_id) ON DELETE RESTRICT,
  intent_id uuid NOT NULL,
  authority_grant_id uuid NOT NULL,
  publication_revision integer NOT NULL CHECK (publication_revision BETWEEN 0 AND 3),
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key char(64) NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  provider_state callscore_provider_state NOT NULL,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  lease_owner text,
  lease_token uuid,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at timestamptz,
  external_object_id text,
  external_url text,
  execution_receipt_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  readback_receipt_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  controlled_reason_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (authority_grant_id),
  UNIQUE (operation_id,workflow_id,generation_id,accepted_evaluation_id),
  UNIQUE (account_scope_hash,provider_tool,action_name,payload_sha256),
  FOREIGN KEY (intent_id,workflow_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256)
    REFERENCES provider_operation_intents(intent_id,workflow_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256) ON DELETE RESTRICT,
  FOREIGN KEY (authority_grant_id,workflow_id,intent_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256)
    REFERENCES external_action_grants(grant_id,workflow_id,intent_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256) ON DELETE RESTRICT,
  CHECK ((lease_owner IS NULL)=(lease_token IS NULL)),
  CHECK ((lease_owner IS NULL)=(lease_expires_at IS NULL)),
  CHECK (provider_state <> 'VERIFIED' OR (external_object_id IS NOT NULL AND execution_receipt_artifact_id IS NOT NULL AND readback_receipt_artifact_id IS NOT NULL))
);

CREATE TABLE provider_operation_events (
  event_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  from_state callscore_provider_state NOT NULL,
  to_state callscore_provider_state NOT NULL,
  controlled_reason_code text NOT NULL,
  dispatch_boundary_at timestamptz,
  provider_response_sha256 char(64) CHECK (provider_response_sha256 IS NULL OR provider_response_sha256 ~ '^[0-9a-f]{64}$'),
  external_object_id text,
  external_url text,
  receipt_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id,sequence_no),
  CHECK (from_state <> to_state),
  CHECK (to_state <> 'DISPATCHING' OR dispatch_boundary_at IS NOT NULL),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE provider_operation_lease_events (
  lease_event_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  lease_generation bigint NOT NULL CHECK (lease_generation > 0),
  prior_lease_owner text,
  lease_owner text NOT NULL,
  lease_token uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  controlled_reason_code text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id,sequence_no),
  UNIQUE (operation_id,lease_generation),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE provider_readback_evidence (
  readback_evidence_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  evidence_type text NOT NULL CHECK (evidence_type IN ('EXECUTION','READBACK','ABSENCE')),
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  publication_revision integer NOT NULL CHECK (publication_revision BETWEEN 0 AND 3),
  dispatch_window_started_at timestamptz NOT NULL,
  dispatch_window_ended_at timestamptz NOT NULL CHECK (dispatch_window_ended_at >= dispatch_window_started_at),
  external_object_id text,
  external_url text,
  visibility text,
  performed boolean NOT NULL,
  evidence_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  verifier_agent_id text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id,sequence_no),
  UNIQUE (operation_id,evidence_type,evidence_artifact_id),
  CHECK ((evidence_type='ABSENCE' AND NOT performed AND external_object_id IS NULL AND external_url IS NULL)
      OR (evidence_type='EXECUTION' AND performed AND external_object_id IS NOT NULL)
      OR (evidence_type='READBACK' AND performed AND external_object_id IS NOT NULL
          AND external_url IS NOT NULL AND btrim(external_url)<>''
          AND visibility IS NOT NULL AND lower(visibility)='public')),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE outcome_measurements (
  measurement_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  publication_id text,
  experiment_id uuid REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES runtime_cohorts(cohort_id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  channel text NOT NULL,
  metric_name text NOT NULL,
  numerator numeric(24,8) NOT NULL,
  denominator numeric(24,8) NOT NULL CHECK (denominator > 0),
  metric_value numeric(24,8) NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL CHECK (window_ended_at >= window_started_at),
  source_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  attribution_contract jsonb NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,sequence_no),
  UNIQUE (workflow_id,metric_name,window_started_at,window_ended_at),
  FOREIGN KEY (experiment_id,cohort_id,variant_id)
    REFERENCES runtime_cohorts(experiment_id,cohort_id,variant_id) ON DELETE RESTRICT,
  CHECK ((experiment_id IS NULL AND cohort_id IS NULL AND variant_id IS NOT NULL)
      OR (experiment_id IS NOT NULL AND cohort_id IS NOT NULL AND variant_id IS NOT NULL)),
  CHECK ((operation_id IS NULL)=(publication_id IS NULL)),
  CHECK (metric_value = numerator / denominator),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE canonical_learning_artifacts (
  learning_artifact_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no BETWEEN 1 AND 4),
  measurement_id uuid NOT NULL REFERENCES outcome_measurements(measurement_id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  experiment_id uuid REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES runtime_cohorts(cohort_id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  agent_id text NOT NULL,
  channel text NOT NULL,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  parameters jsonb NOT NULL,
  evaluator_weighted_score numeric(6,5) NOT NULL CHECK (evaluator_weighted_score BETWEEN 0 AND 1),
  artifact_schema text NOT NULL CHECK (artifact_schema IN ('learning_event.v1','agent_performance_ledger.v1','learning_delta.v1','experiment_result.v1')),
  artifact_payload jsonb NOT NULL,
  artifact_payload_sha256 char(64) NOT NULL CHECK (artifact_payload_sha256 ~ '^[0-9a-f]{64}$'),
  schema_validation_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id,sequence_no),
  UNIQUE (workflow_id,measurement_id,artifact_schema),
  FOREIGN KEY (experiment_id,cohort_id,variant_id)
    REFERENCES runtime_cohorts(experiment_id,cohort_id,variant_id) ON DELETE RESTRICT,
  CHECK ((experiment_id IS NULL AND cohort_id IS NULL AND variant_id IS NOT NULL)
      OR (experiment_id IS NOT NULL AND cohort_id IS NOT NULL AND variant_id IS NOT NULL)),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE runtime_variant_cooldowns (
  cooldown_id uuid PRIMARY KEY,
  variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at >= starts_at + interval '14 days'),
  controlled_reason_code text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (variant_id,sequence_no),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

CREATE TABLE runtime_promotion_events (
  promotion_event_id uuid PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  prior_champion_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  candidate_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('PROMOTE','REJECT','ROLLBACK')),
  evaluator_generation_id uuid REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  trust_generation_id uuid REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  control_sample_size integer NOT NULL CHECK (control_sample_size >= 0),
  treatment_sample_size integer NOT NULL CHECK (treatment_sample_size >= 0),
  observation_days integer NOT NULL CHECK (observation_days >= 0),
  quality_delta numeric(12,6),
  outcome_relative_delta numeric(12,6),
  bootstrap_ci95_lower numeric(12,6),
  safety_violations integer NOT NULL CHECK (safety_violations >= 0),
  provider_verification_rate numeric(8,5) NOT NULL CHECK (provider_verification_rate BETWEEN 0 AND 1),
  controlled_reason_code text NOT NULL,
  decision_payload jsonb NOT NULL,
  expected_registry_version bigint NOT NULL CHECK (expected_registry_version >= 0),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (experiment_id,sequence_no),
  CHECK (prior_champion_variant_id <> candidate_variant_id),
  CHECK (decision='ROLLBACK' OR (evaluator_generation_id IS NOT NULL AND trust_generation_id IS NOT NULL AND evaluator_generation_id <> trust_generation_id)),
  CHECK (
    decision <> 'PROMOTE' OR
    (control_sample_size >= 30 AND treatment_sample_size >= 30 AND observation_days >= 14
     AND quality_delta >= 0.03 AND outcome_relative_delta >= 0.10
     AND bootstrap_ci95_lower >= 0 AND safety_violations=0)
  ),
  CHECK (decision <> 'ROLLBACK' OR controlled_reason_code LIKE 'rollback_%'),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

ALTER TABLE runtime_variant_assignments
  ADD CONSTRAINT runtime_assignment_monitoring_promotion_fk
  FOREIGN KEY (monitoring_promotion_event_id) REFERENCES runtime_promotion_events(promotion_event_id) ON DELETE RESTRICT;

-- Review identity is attested by a role that cannot author reports or review
-- receipts. This binds a claimed reviewer to authenticated Hermes execution
-- lineage instead of accepting three mutually consistent JSON strings.
CREATE TABLE review_execution_attestations (
  review_execution_id uuid PRIMARY KEY,
  target_app_commit_sha char(40) NOT NULL CHECK (target_app_commit_sha ~ '^[0-9a-f]{40}$'),
  target_plan_commit_sha char(40) NOT NULL CHECK (target_plan_commit_sha ~ '^[0-9a-f]{40}$'),
  target_deployment_manifest_sha256 char(64) NOT NULL CHECK (target_deployment_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  review_scope text NOT NULL,
  reviewer_agent_id text NOT NULL,
  hermes_session_id text NOT NULL UNIQUE,
  delegation_batch_id text NOT NULL,
  delegation_task_ordinal smallint NOT NULL CHECK (delegation_task_ordinal >= 0),
  process_identity_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  review_output_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  reviewed_subject_sha256 char(64) NOT NULL CHECK (reviewed_subject_sha256 ~ '^[0-9a-f]{64}$'),
  verdict text NOT NULL CHECK (verdict IN ('PASS','FAIL')),
  attested_by_role text NOT NULL CHECK (attested_by_role='callscore_plan_review_identity_attestor'),
  attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (target_app_commit_sha,target_plan_commit_sha,target_deployment_manifest_sha256,review_scope,reviewer_agent_id),
  UNIQUE (delegation_batch_id,delegation_task_ordinal)
);

CREATE TABLE autonomy_review_receipts (
  review_receipt_id uuid PRIMARY KEY,
  review_execution_id uuid NOT NULL UNIQUE REFERENCES review_execution_attestations(review_execution_id) ON DELETE RESTRICT,
  phase text NOT NULL,
  reviewed_subject_sha256 char(64) NOT NULL CHECK (reviewed_subject_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_artifact_id uuid NOT NULL UNIQUE REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_agent_id text NOT NULL,
  status text NOT NULL CHECK (status='PASS'),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE provider_object_rollback_receipts (
  rollback_receipt_id uuid PRIMARY KEY,
  report_stream_id text NOT NULL,
  report_sequence_no bigint NOT NULL CHECK (report_sequence_no>0),
  deployment_manifest_sha256 char(64) NOT NULL CHECK (deployment_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL UNIQUE REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  receipt_artifact_id uuid NOT NULL UNIQUE REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status='PASS'),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at>verified_at),
  UNIQUE (report_stream_id,report_sequence_no,deployment_manifest_sha256)
);

CREATE TABLE runtime_variant_rollback_receipts (
  rollback_receipt_id uuid PRIMARY KEY,
  report_stream_id text NOT NULL,
  report_sequence_no bigint NOT NULL CHECK (report_sequence_no>0),
  deployment_manifest_sha256 char(64) NOT NULL CHECK (deployment_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  experiment_id uuid NOT NULL REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  trigger_measurement_id uuid NOT NULL REFERENCES outcome_measurements(measurement_id) ON DELETE RESTRICT,
  prior_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  restored_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  promotion_event_id uuid NOT NULL REFERENCES runtime_promotion_events(promotion_event_id) ON DELETE RESTRICT,
  rollback_event_id uuid NOT NULL UNIQUE REFERENCES runtime_promotion_events(promotion_event_id) ON DELETE RESTRICT,
  receipt_artifact_id uuid NOT NULL UNIQUE REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status='PASS'),
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at>verified_at),
  UNIQUE (report_stream_id,report_sequence_no,deployment_manifest_sha256)
);

CREATE TABLE autonomy_final_reports (
  report_id uuid PRIMARY KEY,
  report_stream_id text NOT NULL,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  report_schema text NOT NULL CHECK (report_schema='callscore.autonomy_implementation_report.v7'),
  app_commit_sha char(40) NOT NULL CHECK (app_commit_sha ~ '^[0-9a-f]{40}$'),
  workplane_commit_sha char(40) NOT NULL CHECK (workplane_commit_sha ~ '^[0-9a-f]{40}$'),
  plan_commit_sha char(40) NOT NULL CHECK (plan_commit_sha ~ '^[0-9a-f]{40}$'),
  graph_source_sha256 char(64) NOT NULL CHECK (graph_source_sha256 ~ '^[0-9a-f]{64}$'),
  migration_sha256 char(64) NOT NULL CHECK (migration_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_script_manifest_sha256 char(64) NOT NULL CHECK (runtime_script_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  image_digest text NOT NULL CHECK (image_digest ~ '^sha256:[0-9a-f]{64}$'),
  prompt_manifest_sha256 char(64) NOT NULL CHECK (prompt_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  deployment_manifest_sha256 char(64) NOT NULL CHECK (deployment_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  report_json_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  report_json_sha256 char(64) NOT NULL CHECK (report_json_sha256 ~ '^[0-9a-f]{64}$'),
  producer_agent_id text NOT NULL,
  verifier_agent_id text NOT NULL,
  verifier_artifact_id uuid NOT NULL REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  verifier_sha256 char(64) NOT NULL CHECK (verifier_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_status text NOT NULL CHECK (verifier_status IN ('PASS','FAIL')),
  final_status text NOT NULL CHECK (final_status IN ('PASS','BLOCKED','FAIL')),
  live_activation_approved boolean NOT NULL,
  blockers jsonb NOT NULL,
  canary_status text NOT NULL CHECK (canary_status IN ('PASS','BLOCKED_BY_GRAPH','FAIL')),
  canary_provider_operation_id uuid REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  canary_readback_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  canary_provider_rollback_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  runtime_variant_rollback_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
  provider_rollback_receipt_id uuid NOT NULL REFERENCES provider_object_rollback_receipts(rollback_receipt_id) ON DELETE RESTRICT,
  runtime_rollback_receipt_id uuid NOT NULL REFERENCES runtime_variant_rollback_receipts(rollback_receipt_id) ON DELETE RESTRICT,
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (report_stream_id,sequence_no),
  CHECK (producer_agent_id <> verifier_agent_id),
  CHECK (jsonb_typeof(blockers)='array'),
  CHECK (
    final_status <> 'PASS' OR
    (verifier_status='PASS' AND live_activation_approved AND jsonb_array_length(blockers)=0
     AND canary_status='PASS' AND canary_provider_operation_id IS NOT NULL
     AND canary_readback_artifact_id IS NOT NULL AND canary_provider_rollback_artifact_id IS NOT NULL
     AND runtime_variant_rollback_artifact_id IS NOT NULL)
  ),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash)=32),
  CHECK (record_hash IS NULL OR octet_length(record_hash)=32)
);

-- Ledger trigger installation: stream column, then monotonic sequence column.
DO $$
DECLARE spec text[];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['autonomy_workflow_transitions','workflow_id','sequence_no'],
    ARRAY['autonomy_workflow_lease_events','workflow_id','sequence_no'],
    ARRAY['autonomy_retry_events','workflow_id','sequence_no'],
    ARRAY['canonical_policy_snapshots','policy_record_id','sequence_no'],
    ARRAY['canonical_receipt_evidence','workflow_id','sequence_no'],
    ARRAY['provider_operation_intents','workflow_id','sequence_no'],
    ARRAY['external_action_grants','workflow_id','sequence_no'],
    ARRAY['external_action_grant_revocations','grant_id','sequence_no'],
    ARRAY['agent_delegation_events','delegation_id','sequence_no'],
    ARRAY['runtime_variant_assignments','workflow_id','sequence_no'],
    ARRAY['generation_provenance','workflow_id','sequence_no'],
    ARRAY['quality_evaluations','workflow_id','sequence_no'],
    ARRAY['quality_gate_evidence','workflow_id','sequence_no'],
    ARRAY['artifact_revisions','workflow_id','sequence_no'],
    ARRAY['provider_operation_events','operation_id','sequence_no'],
    ARRAY['provider_operation_lease_events','operation_id','sequence_no'],
    ARRAY['provider_readback_evidence','operation_id','sequence_no'],
    ARRAY['outcome_measurements','workflow_id','sequence_no'],
    ARRAY['canonical_learning_artifacts','workflow_id','sequence_no'],
    ARRAY['runtime_variant_cooldowns','variant_id','sequence_no'],
    ARRAY['runtime_promotion_events','experiment_id','sequence_no'],
    ARRAY['verified_evidence_bindings','subject_stream_id','sequence_no'],
    ARRAY['autonomy_final_reports','report_stream_id','sequence_no']
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_hash BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_ledger_hash(%L,%L)',
      spec[1],spec[1],spec[2],spec[3]
    );
    EXECUTE format(
      'CREATE TRIGGER %I_reject_mutation BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation()',
      spec[1],spec[1]
    );
  END LOOP;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['autonomy_workflows','agent_delegations','provider_operations','runtime_registry'] LOOP
    EXECUTE format('CREATE TRIGGER %I_reject_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_projection_delete()',table_name,table_name);
  END LOOP;
END;
$$;

-- Fixed lifecycle map used by the only runtime transition function.
CREATE TRIGGER legacy_channel_task_snapshots_reject_mutation
BEFORE UPDATE OR DELETE ON legacy_channel_task_migration_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE FUNCTION transition_is_allowed(
  p_class callscore_execution_class,
  p_from callscore_workflow_state,
  p_to callscore_workflow_state
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, callscore_plan_contract
AS $$
  SELECT CASE
    WHEN p_from='QUEUED' AND p_to='HEAD_PLANNING' THEN true
    WHEN p_from='HEAD_PLANNING' AND p_to IN ('CHILDREN_RUNNING','FAILED') THEN true
    WHEN p_from='CHILDREN_RUNNING' AND p_to IN ('HEAD_SYNTHESIS','RETRY','FAILED') THEN true
    WHEN p_from='HEAD_SYNTHESIS' AND p_to IN ('QUALITY_EVALUATION','FAILED') THEN true
    WHEN p_from='QUALITY_EVALUATION' AND p_to IN ('REVISION','READY','FAILED') THEN true
    WHEN p_from='REVISION' AND p_to IN ('QUALITY_EVALUATION','FAILED') THEN true
    WHEN p_class='OWNED_PUBLIC_MUTATION' AND p_from='READY' AND p_to IN ('EXECUTING','FAILED') THEN true
    WHEN p_class<>'OWNED_PUBLIC_MUTATION' AND p_from='READY' AND p_to IN ('OUTCOME_PENDING','FAILED') THEN true
    WHEN p_from='EXECUTING' AND p_to IN ('PROVIDER_VERIFIED','RETRY','FAILED') THEN true
    WHEN p_from='PROVIDER_VERIFIED' AND p_to IN ('OUTCOME_PENDING','RETRY','FAILED') THEN true
    WHEN p_from='OUTCOME_PENDING' AND p_to IN ('OUTCOME_MEASURED','RETRY','FAILED') THEN true
    WHEN p_from='OUTCOME_MEASURED' AND p_to IN ('LEARNING_RECORDED','FAILED') THEN true
    WHEN p_from='LEARNING_RECORDED' AND p_to IN ('COMPLETE','FAILED') THEN true
    WHEN p_from='RETRY' AND p_to IN ('CHILDREN_RUNNING','EXECUTING','PROVIDER_VERIFIED','OUTCOME_PENDING','FAILED') THEN true
    ELSE false
  END;
$$;

CREATE FUNCTION enqueue_autonomy_workflow(
  p_workflow_id uuid,
  p_workflow_run_id uuid,
  p_source_channel_task_id uuid,
  p_channel_task_idempotency_key text,
  p_execution_class callscore_execution_class,
  p_head_agent_id text,
  p_channel text,
  p_task_type text,
  p_policy_version text,
  p_input_payload jsonb,
  p_input_payload_sha256 char(64)
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  IF p_source_channel_task_id IS NULL THEN RAISE EXCEPTION 'canonical task-bound workflow requires channel task UUID' USING ERRCODE='23514'; END IF;
  INSERT INTO callscore_plan_contract.channel_tasks(
    id,agent_id,channel_id,task_type,status,idempotency_key,payload_hash,payload,blocker
  ) VALUES (p_source_channel_task_id,p_head_agent_id,p_channel,p_task_type,'blocked',p_channel_task_idempotency_key,p_input_payload_sha256,p_input_payload,
    'migrated_to_autonomy:'||p_workflow_id::text)
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.channel_tasks
    WHERE id=p_source_channel_task_id AND agent_id=p_head_agent_id AND channel_id=p_channel AND task_type=p_task_type
      AND idempotency_key=p_channel_task_idempotency_key AND payload_hash=p_input_payload_sha256
  ) THEN RAISE EXCEPTION 'compatibility source identity mismatch' USING ERRCODE='23514'; END IF;
  INSERT INTO callscore_plan_contract.autonomy_workflows(
    workflow_id,workflow_run_id,source_channel_task_id,execution_class,head_agent_id,channel,task_type,policy_version,input_payload,
    input_payload_sha256,checkpoint_namespace,checkpoint_thread_id
  ) VALUES (
    p_workflow_id,p_workflow_run_id,p_source_channel_task_id,p_execution_class,p_head_agent_id,p_channel,p_task_type,p_policy_version,p_input_payload,
    p_input_payload_sha256,'callscore-supervisor/'||p_task_type,'callscore-task:'||p_workflow_id::text
  );
  RETURN p_workflow_id;
END;
$$;

CREATE FUNCTION backfill_legacy_channel_tasks() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_pending integer; v_running integer; v_terminal integer;
BEGIN
  LOCK TABLE callscore_plan_contract.channel_tasks IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO callscore_plan_contract.legacy_channel_task_migration_snapshots(
    channel_task_id,original_status,original_row,original_row_sha256,migration_disposition
  )
  SELECT t.id,t.status,to_jsonb(t),encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),
    CASE WHEN t.status='pending' THEN 'BACKFILL_QUEUED_FAIL_CLOSED'
         WHEN t.status='running' THEN 'BACKFILL_FAILED_RECONCILIATION_REQUIRED'
         ELSE 'LEGACY_HISTORY_ONLY' END
  FROM callscore_plan_contract.channel_tasks t
  ON CONFLICT (channel_task_id) DO NOTHING;

  INSERT INTO callscore_plan_contract.autonomy_workflows(
    workflow_id,workflow_run_id,source_channel_task_id,execution_class,workflow_state,achievement_class,
    head_agent_id,channel,task_type,policy_version,input_payload,input_payload_sha256,state_version,
    checkpoint_namespace,checkpoint_thread_id,terminal_reason_code
  )
  SELECT t.id,md5('workflow-run:'||t.id::text)::uuid,t.id,
    CASE WHEN t.task_type IN ('engagement_discovery','status_observation','analytics_collect','sentinel_observation')
         THEN 'READ_ONLY_OBSERVATION'::callscore_plan_contract.callscore_execution_class
         ELSE 'RESTRICTED_DRAFT'::callscore_plan_contract.callscore_execution_class END,
    CASE WHEN t.status='running' THEN 'FAILED'::callscore_plan_contract.callscore_workflow_state
         ELSE 'QUEUED'::callscore_plan_contract.callscore_workflow_state END,
    'OBSERVED',t.agent_id,t.channel_id,t.task_type,'legacy-024',t.payload,
    COALESCE(NULLIF(t.payload_hash,''),encode(sha256(convert_to(t.payload::text,'UTF8')),'hex')),
    0,'callscore-supervisor/'||t.task_type,'callscore-task:'||t.id::text,
    CASE WHEN t.status='running' THEN 'legacy_running_reconciliation_required' ELSE NULL END
  FROM callscore_plan_contract.channel_tasks t
  WHERE t.status IN ('pending','running')
  ON CONFLICT (source_channel_task_id) DO NOTHING;

  UPDATE callscore_plan_contract.channel_tasks t
  SET status='blocked',blocker='migrated_to_autonomy:'||w.workflow_id::text,updated_at=clock_timestamp()
  FROM callscore_plan_contract.autonomy_workflows w
  WHERE w.source_channel_task_id=t.id AND t.status IN ('pending','running');

  SELECT count(*) INTO v_pending FROM callscore_plan_contract.legacy_channel_task_migration_snapshots WHERE original_status='pending';
  SELECT count(*) INTO v_running FROM callscore_plan_contract.legacy_channel_task_migration_snapshots WHERE original_status='running';
  SELECT count(*) INTO v_terminal FROM callscore_plan_contract.legacy_channel_task_migration_snapshots WHERE original_status NOT IN ('pending','running');
  IF EXISTS(
    SELECT 1 FROM callscore_plan_contract.legacy_channel_task_migration_snapshots s
    JOIN callscore_plan_contract.autonomy_workflows w ON w.source_channel_task_id=s.channel_task_id
    WHERE s.original_status NOT IN ('pending','running')
  ) OR EXISTS(
    SELECT 1 FROM callscore_plan_contract.legacy_channel_task_migration_snapshots s
    JOIN callscore_plan_contract.autonomy_workflows w ON w.source_channel_task_id=s.channel_task_id
    WHERE s.original_status='running' AND (w.workflow_state<>'FAILED' OR w.terminal_reason_code<>'legacy_running_reconciliation_required')
  ) THEN RAISE EXCEPTION 'conservative legacy mapping invariant failed' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('pending_snapshots',v_pending,'running_snapshots',v_running,'terminal_history_snapshots',v_terminal);
END;
$$;

CREATE FUNCTION reject_legacy_channel_task_reactivation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  IF OLD.blocker LIKE 'migrated_to_autonomy:%' AND NEW.status IN ('pending','running') THEN
    RAISE EXCEPTION 'legacy claimant permanently fenced after migration 025' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER channel_tasks_reject_legacy_reactivation
BEFORE UPDATE ON channel_tasks
FOR EACH ROW EXECUTE FUNCTION reject_legacy_channel_task_reactivation();

CREATE FUNCTION set_activation_fence(
  p_fenced boolean,
  p_expected_version bigint,
  p_reason text,
  p_actor text,
  p_approval_artifact_id uuid,
  p_deployment_subject_sha256 char(64)
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_version bigint;
BEGIN
  IF NOT p_fenced AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
    WHERE b.evidence_artifact_id=p_approval_artifact_id
      AND b.subject_kind='activation_fence'
      AND b.subject_id='unfence:'||p_expected_version::text
      AND b.subject_sha256=p_deployment_subject_sha256
      AND b.validation_schema='activation-approval.v2'
      AND b.validation_status='PASS'
  ) THEN RAISE EXCEPTION 'unfence requires exact independently authenticated activation approval' USING ERRCODE='23514'; END IF;
  UPDATE callscore_plan_contract.autonomy_activation_fence
  SET fenced=p_fenced,fence_version=fence_version+1,controlled_reason_code=p_reason,updated_by_role=p_actor,updated_at=clock_timestamp()
      ,active_deployment_subject_sha256=CASE WHEN p_fenced THEN NULL ELSE p_deployment_subject_sha256 END
      ,activation_approval_artifact_id=CASE WHEN p_fenced THEN NULL ELSE p_approval_artifact_id END
  WHERE singleton=true AND fence_version=p_expected_version
  RETURNING fence_version INTO v_version;
  IF v_version IS NULL THEN RAISE EXCEPTION 'activation fence CAS failed' USING ERRCODE='40001'; END IF;
  RETURN v_version;
END;
$$;

CREATE FUNCTION record_specialist_requirement(
  p_requirement_id uuid,p_workflow_id uuid,p_revision_number integer,p_requirement_stage text,p_delegated_role text,p_ordinal smallint,
  p_child_agent_id text,p_prompt_sha256 char(64),p_model text,p_provider text,p_allowed_capabilities jsonb,
  p_required_output_schema text,p_router_receipt_artifact_id uuid,p_tool_receipt_artifact_id uuid,
  p_requirement_sha256 char(64)
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_w.workflow_state<>'HEAD_PLANNING' OR v_w.revision_count<>p_revision_number
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_router_receipt_artifact_id AND b.subject_kind='specialist_requirement'
         AND b.subject_id=p_requirement_id::text AND b.subject_sha256=p_requirement_sha256
         AND b.validation_schema='callscore.task_router_receipt.v1')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_tool_receipt_artifact_id AND b.subject_kind='specialist_requirement'
         AND b.subject_id=p_requirement_id::text AND b.subject_sha256=p_requirement_sha256
         AND b.validation_schema='callscore.tool_inheritance_receipt.v1') THEN
    RAISE EXCEPTION 'specialist requirement lacks exact router/tool inheritance authority' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.workflow_specialist_requirements(
    requirement_id,workflow_id,revision_number,requirement_stage,delegated_role,ordinal,canonical_child_agent_id,prompt_sha256,
    model,provider,allowed_capabilities,required_output_schema,router_receipt_artifact_id,
    tool_inheritance_receipt_artifact_id,requirement_sha256
  ) VALUES(p_requirement_id,p_workflow_id,p_revision_number,p_requirement_stage,p_delegated_role,p_ordinal,p_child_agent_id,p_prompt_sha256,
    p_model,p_provider,p_allowed_capabilities,p_required_output_schema,p_router_receipt_artifact_id,
    p_tool_receipt_artifact_id,p_requirement_sha256);
  RETURN p_requirement_id;
END;
$$;

CREATE FUNCTION create_agent_delegation(
  p_delegation_id uuid,p_requirement_id uuid,p_child_execution_id uuid,p_expected_executable text,p_expected_uid integer,p_expected_cwd text,
  p_usage_path text,p_stdout_path text,p_deadline_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_r callscore_plan_contract.workflow_specialist_requirements;
BEGIN
  SELECT * INTO v_r FROM callscore_plan_contract.workflow_specialist_requirements WHERE requirement_id=p_requirement_id;
  IF v_r.requirement_id IS NULL THEN RAISE EXCEPTION 'unknown canonical specialist requirement' USING ERRCODE='23514'; END IF;
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(v_r.workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=v_r.workflow_id FOR UPDATE;
  IF NOT ((v_r.requirement_stage='SYNTHESIS_INPUT' AND v_w.workflow_state IN ('HEAD_PLANNING','CHILDREN_RUNNING'))
          OR (v_r.requirement_stage='POST_SYNTHESIS_EVALUATOR' AND v_w.workflow_state='QUALITY_EVALUATION'))
     OR v_r.revision_number<>v_w.revision_count
     OR p_usage_path NOT LIKE '/srv/agents/hermes/profiles/callscore/runtime/children/%'
     OR p_stdout_path NOT LIKE '/srv/agents/hermes/profiles/callscore/runtime/children/%'
     OR p_child_execution_id IS NULL OR p_expected_executable NOT LIKE '/%'
     OR p_expected_uid<0 OR p_expected_cwd NOT LIKE '/%'
     OR p_deadline_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'delegation intent predicate failed' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.agent_delegations(
    delegation_id,requirement_id,workflow_id,workflow_run_id,revision_number,delegated_role,ordinal,canonical_child_agent_id,
    child_execution_id,expected_executable,expected_uid,expected_cwd,launch_status,usage_file_path,stdout_file_path,
    prompt_sha256,model,provider,allowed_capabilities,required_output_schema,lease_generation,deadline_at
  ) VALUES (p_delegation_id,p_requirement_id,v_r.workflow_id,v_w.workflow_run_id,v_r.revision_number,v_r.delegated_role,v_r.ordinal,v_r.canonical_child_agent_id,
    p_child_execution_id,p_expected_executable,p_expected_uid,p_expected_cwd,'DISPATCH_INTENT',p_usage_path,p_stdout_path,
    v_r.prompt_sha256,v_r.model,v_r.provider,v_r.allowed_capabilities,v_r.required_output_schema,1,p_deadline_at);
  INSERT INTO callscore_plan_contract.agent_delegation_events(event_id,delegation_id,sequence_no,status,child_execution_id,lease_generation,detail)
  VALUES(gen_random_uuid(),p_delegation_id,1,'DISPATCH_INTENT',p_child_execution_id,1,
    jsonb_build_object('reason','dispatch_intent_committed','requirement_id',p_requirement_id,'expected_executable',p_expected_executable,'expected_uid',p_expected_uid,'expected_cwd',p_expected_cwd));
  RETURN p_delegation_id;
END;
$$;

CREATE FUNCTION record_child_join_manifest(
  p_join_manifest_id uuid,p_workflow_id uuid,p_revision_number integer,p_manifest_artifact_id uuid,
  p_manifest_sha256 char(64),p_members jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_required integer; v_supplied integer;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT count(*) INTO v_required FROM callscore_plan_contract.workflow_specialist_requirements
   WHERE workflow_id=p_workflow_id AND revision_number=p_revision_number AND requirement_stage='SYNTHESIS_INPUT';
  SELECT count(*) INTO v_supplied FROM jsonb_array_elements(p_members);
  IF v_w.workflow_state<>'CHILDREN_RUNNING' OR v_w.revision_count<>p_revision_number OR v_required=0 OR v_supplied<>v_required
     OR encode(sha256(convert_to(p_members::text,'UTF8')),'hex')<>p_manifest_sha256
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
       WHERE artifact_id=p_manifest_artifact_id AND content_sha256=p_manifest_sha256 AND artifact_kind='child_join_manifest')
     OR EXISTS(
       SELECT 1 FROM callscore_plan_contract.workflow_specialist_requirements r
       WHERE r.workflow_id=p_workflow_id AND r.revision_number=p_revision_number AND r.requirement_stage='SYNTHESIS_INPUT' AND NOT EXISTS(
         SELECT 1 FROM jsonb_to_recordset(p_members) m(requirement_id uuid,delegation_id uuid,output_artifact_id uuid,output_sha256 char(64))
         JOIN callscore_plan_contract.agent_delegations d ON d.delegation_id=m.delegation_id
         JOIN LATERAL (SELECT * FROM callscore_plan_contract.agent_delegation_events e
           WHERE e.delegation_id=d.delegation_id AND e.status='ACCEPTED' ORDER BY e.sequence_no DESC LIMIT 1) e ON true
         WHERE m.requirement_id=r.requirement_id AND d.requirement_id=r.requirement_id AND d.launch_status='ACCEPTED'
           AND e.output_artifact_id=m.output_artifact_id AND e.output_sha256=m.output_sha256
       )
     ) THEN RAISE EXCEPTION 'child join manifest is incomplete, substituted, or not ACCEPTED' USING ERRCODE='23514'; END IF;
  INSERT INTO callscore_plan_contract.child_join_manifests(join_manifest_id,workflow_id,revision_number,manifest_artifact_id,manifest_sha256)
  VALUES(p_join_manifest_id,p_workflow_id,p_revision_number,p_manifest_artifact_id,p_manifest_sha256);
  INSERT INTO callscore_plan_contract.child_join_manifest_members(join_manifest_id,requirement_id,delegation_id,output_artifact_id,output_sha256)
  SELECT p_join_manifest_id,m.requirement_id,m.delegation_id,m.output_artifact_id,m.output_sha256
  FROM jsonb_to_recordset(p_members) m(requirement_id uuid,delegation_id uuid,output_artifact_id uuid,output_sha256 char(64));
  RETURN p_join_manifest_id;
END;
$$;

CREATE FUNCTION record_agent_delegation_event(
  p_delegation_id uuid,p_expected_status callscore_join_status,p_expected_lease_generation bigint,
  p_to_status callscore_join_status,p_hermes_pid integer,p_hermes_pgid integer,p_start_ticks bigint,
  p_session_id text,p_usage_artifact_id uuid,p_usage_sha256 char(64),p_output_artifact_id uuid,
  p_output_sha256 char(64),p_detail jsonb
) RETURNS agent_delegations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_d callscore_plan_contract.agent_delegations; v_seq bigint;
BEGIN
  SELECT * INTO v_d FROM callscore_plan_contract.agent_delegations WHERE delegation_id=p_delegation_id FOR UPDATE;
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(v_d.workflow_id);
  IF v_d.launch_status<>p_expected_status OR v_d.lease_generation<>p_expected_lease_generation
     OR NOT ((p_expected_status='DISPATCH_INTENT' AND p_to_status IN ('SPAWNED','ORPHANED'))
          OR (p_expected_status='ORPHANED' AND p_to_status='DISPATCH_INTENT')
          OR (p_expected_status='SPAWNED' AND p_to_status IN ('RUNNING','SUCCEEDED','FAILED','TIMED_OUT','CANCELLED'))
          OR (p_expected_status='RUNNING' AND p_to_status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED'))
          OR (p_expected_status='SUCCEEDED' AND p_to_status IN ('ACCEPTED','REJECTED'))) THEN
    RAISE EXCEPTION 'delegation transition CAS/map failed' USING ERRCODE='40001';
  END IF;
  IF p_to_status IN ('SPAWNED','RUNNING','SUCCEEDED','ACCEPTED')
     AND (p_hermes_pid IS NULL OR p_hermes_pgid IS NULL OR p_start_ticks IS NULL) THEN
    RAISE EXCEPTION 'live/success delegation event requires machine process identity' USING ERRCODE='23514';
  END IF;
  IF p_to_status IN ('SUCCEEDED','ACCEPTED') AND (
       p_session_id IS NULL OR p_usage_artifact_id IS NULL OR p_output_artifact_id IS NULL
       OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_usage_artifact_id AND content_sha256=p_usage_sha256)
       OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_output_artifact_id AND content_sha256=p_output_sha256)
     ) THEN RAISE EXCEPTION 'success requires machine usage and output artifact hashes' USING ERRCODE='23514'; END IF;
  IF p_to_status='ACCEPTED' AND (
       NOT EXISTS(
         SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
         WHERE b.evidence_artifact_id=p_usage_artifact_id AND b.subject_kind='child_process_identity'
           AND b.subject_id=p_delegation_id::text AND b.subject_sha256=p_usage_sha256
           AND b.validation_schema='hermes-child-process-identity.v1'
       )
       OR NOT EXISTS(
         SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
         WHERE b.evidence_artifact_id=p_output_artifact_id AND b.subject_kind='child_output'
           AND b.subject_id=p_delegation_id::text AND b.subject_sha256=p_output_sha256
           AND b.validation_schema=v_d.required_output_schema
       )
     ) THEN RAISE EXCEPTION 'accepted child lacks independently authenticated process/output binding' USING ERRCODE='23514'; END IF;
  UPDATE callscore_plan_contract.agent_delegations
  SET launch_status=p_to_status,hermes_pid=COALESCE(p_hermes_pid,hermes_pid),hermes_pgid=COALESCE(p_hermes_pgid,hermes_pgid),
      hermes_start_ticks=COALESCE(p_start_ticks,hermes_start_ticks),hermes_session_id=COALESCE(p_session_id,hermes_session_id),
      lease_generation=CASE WHEN p_expected_status='ORPHANED' AND p_to_status='DISPATCH_INTENT' THEN lease_generation+1 ELSE lease_generation END
  WHERE delegation_id=p_delegation_id RETURNING * INTO v_d;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.agent_delegation_events WHERE delegation_id=p_delegation_id;
  INSERT INTO callscore_plan_contract.agent_delegation_events(
    event_id,delegation_id,sequence_no,status,child_execution_id,lease_generation,hermes_pid,hermes_pgid,hermes_start_ticks,
    hermes_session_id,usage_artifact_id,usage_sha256,output_artifact_id,output_sha256,detail
  ) VALUES (gen_random_uuid(),p_delegation_id,v_seq,p_to_status,v_d.child_execution_id,v_d.lease_generation,p_hermes_pid,p_hermes_pgid,p_start_ticks,
    p_session_id,p_usage_artifact_id,p_usage_sha256,p_output_artifact_id,p_output_sha256,p_detail);
  RETURN v_d;
END;
$$;

CREATE FUNCTION record_autonomy_artifact(
  p_artifact_id uuid,
  p_artifact_kind text,
  p_artifact_uri text,
  p_content_sha256 char(64),
  p_byte_length bigint,
  p_media_type text,
  p_created_by_agent_id text,
  p_verified_by_agent_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  INSERT INTO callscore_plan_contract.autonomy_artifacts(
    artifact_id,artifact_kind,artifact_uri,content_sha256,byte_length,media_type,created_by_agent_id,verified_by_agent_id
  ) VALUES (p_artifact_id,p_artifact_kind,p_artifact_uri,p_content_sha256,p_byte_length,p_media_type,p_created_by_agent_id,p_verified_by_agent_id);
  RETURN p_artifact_id;
END;
$$;

CREATE FUNCTION record_verified_evidence_binding(
  p_binding_id uuid,
  p_evidence_artifact_id uuid,
  p_expected_evidence_sha256 char(64),
  p_subject_kind text,
  p_subject_id text,
  p_subject_sha256 char(64),
  p_validation_schema text,
  p_verifier_agent_id text,
  p_verifier_context jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_artifact callscore_plan_contract.autonomy_artifacts; v_sequence_no bigint;
BEGIN
  SELECT * INTO v_artifact
  FROM callscore_plan_contract.autonomy_artifacts
  WHERE artifact_id=p_evidence_artifact_id AND content_sha256=p_expected_evidence_sha256;
  IF NOT FOUND OR v_artifact.created_by_agent_id=p_verifier_agent_id
     OR v_artifact.verified_by_agent_id<>p_verifier_agent_id
     OR p_verifier_context='{}'::jsonb THEN
    RAISE EXCEPTION 'independent evidence binding predicate failed' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_subject_kind||':'||p_subject_id,0));
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_sequence_no
  FROM callscore_plan_contract.verified_evidence_bindings
  WHERE subject_stream_id=p_subject_kind||':'||p_subject_id;
  INSERT INTO callscore_plan_contract.verified_evidence_bindings(
    binding_id,subject_stream_id,sequence_no,evidence_artifact_id,evidence_sha256,subject_kind,subject_id,subject_sha256,
    validation_schema,validation_status,verifier_agent_id,verifier_context
  ) VALUES (
    p_binding_id,p_subject_kind||':'||p_subject_id,v_sequence_no,p_evidence_artifact_id,p_expected_evidence_sha256,p_subject_kind,p_subject_id,p_subject_sha256,
    p_validation_schema,'PASS',p_verifier_agent_id,p_verifier_context
  );
  RETURN p_binding_id;
END;
$$;

CREATE FUNCTION record_canonical_policy_snapshot(
  p_policy_snapshot_id uuid,p_policy_record_id text,p_policy_commit_sha char(40),p_registry_sha256 char(64),
  p_registry_version text,p_channel text,p_account_scope_hash char(64),p_mutation_family text,
  p_provider_tool text,p_action_name text,p_valid_from timestamptz,p_valid_until timestamptz,
  p_rollback_contract jsonb,p_validation_artifact_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_sequence bigint;
BEGIN
  IF p_valid_until<=p_valid_from OR jsonb_typeof(p_rollback_contract)<>'object'
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_validation_artifact_id AND b.subject_kind='canonical_policy_snapshot'
         AND b.subject_id=p_policy_record_id AND b.subject_sha256=p_registry_sha256
         AND b.validation_schema='gtm-agent-registry-policy.v1' AND b.validation_status='PASS'
     ) THEN RAISE EXCEPTION 'canonical policy snapshot exact validation predicate failed' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('canonical_policy_snapshot:'||p_policy_record_id,0));
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_sequence
  FROM callscore_plan_contract.canonical_policy_snapshots WHERE policy_record_id=p_policy_record_id;
  INSERT INTO callscore_plan_contract.canonical_policy_snapshots(
    policy_snapshot_id,sequence_no,policy_record_id,policy_commit_sha,registry_sha256,registry_version,channel,
    account_scope_hash,mutation_family,provider_tool,action_name,readiness_status,valid_from,valid_until,rollback_contract
  ) VALUES(p_policy_snapshot_id,v_sequence,p_policy_record_id,p_policy_commit_sha,p_registry_sha256,p_registry_version,p_channel,
    p_account_scope_hash,p_mutation_family,p_provider_tool,p_action_name,'READY_PUBLIC_OWNED',p_valid_from,p_valid_until,p_rollback_contract);
  RETURN p_policy_snapshot_id;
END;
$$;

CREATE FUNCTION assert_current_live_workflow_lease(p_workflow_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.autonomy_workflows
    WHERE workflow_id=p_workflow_id
      AND lease_token=current_setting('callscore.workflow_lease_token',true)::uuid
      AND lease_owner=current_setting('callscore.workflow_lease_owner',true)
      AND lease_expires_at>clock_timestamp()
      AND workflow_state NOT IN ('RETRY','COMPLETE','FAILED')
  ) THEN
    RAISE EXCEPTION 'current live workflow lease binding failed' USING ERRCODE='40001';
  END IF;
END;
$$;

CREATE FUNCTION claim_autonomy_workflow(
  p_workflow_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_expected_version bigint,
  p_lease_seconds integer
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_row callscore_plan_contract.autonomy_workflows;
BEGIN
  IF (SELECT fenced FROM callscore_plan_contract.autonomy_activation_fence WHERE singleton=true) THEN
    RAISE EXCEPTION 'autonomy activation is fenced' USING ERRCODE='55000';
  END IF;
  IF p_lease_seconds < 10 OR p_lease_seconds > 900 THEN RAISE EXCEPTION 'invalid lease duration'; END IF;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET workflow_state='HEAD_PLANNING',state_version=state_version+1,lease_owner=p_worker_id,
      lease_token=p_lease_token,lease_generation=lease_generation+1,
      lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id AND state_version=p_expected_version
    AND workflow_state='QUEUED' AND lease_owner IS NULL
  RETURNING * INTO v_row;
  IF v_row.workflow_id IS NULL THEN RAISE EXCEPTION 'claim CAS failed' USING ERRCODE='40001'; END IF;
  INSERT INTO callscore_plan_contract.autonomy_workflow_transitions(
    transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,
    lease_generation,controlled_reason_code
  ) VALUES (gen_random_uuid(),p_workflow_id,v_row.state_version,'QUEUED','HEAD_PLANNING',v_row.state_version-1,v_row.state_version,v_row.lease_generation,'claim_acquired');
  INSERT INTO callscore_plan_contract.autonomy_workflow_lease_events(
    lease_event_id,workflow_id,sequence_no,state_version,lease_generation,lease_owner,lease_token,lease_expires_at,controlled_reason_code
  ) VALUES (gen_random_uuid(),p_workflow_id,v_row.lease_generation,v_row.state_version,v_row.lease_generation,
    p_worker_id,p_lease_token,v_row.lease_expires_at,'initial_claim');
  RETURN v_row;
END;
$$;

CREATE FUNCTION schedule_autonomy_retry(
  p_workflow_id uuid,p_from callscore_workflow_state,p_expected_version bigint,p_lease_token uuid,
  p_retry_at timestamptz,p_reason text
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_current callscore_plan_contract.autonomy_workflows; v_row callscore_plan_contract.autonomy_workflows;
        v_to callscore_plan_contract.callscore_workflow_state; v_snapshot jsonb; v_retry_sequence bigint;
BEGIN
  SELECT * INTO v_current FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_current.workflow_state<>p_from OR v_current.state_version<>p_expected_version OR v_current.lease_token<>p_lease_token
     OR v_current.lease_expires_at IS NULL OR v_current.lease_expires_at<=clock_timestamp()
     OR p_from NOT IN ('CHILDREN_RUNNING','EXECUTING','PROVIDER_VERIFIED','OUTCOME_PENDING')
     OR p_retry_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'retry schedule CAS/state/time predicate failed' USING ERRCODE='40001';
  END IF;
  v_snapshot:=jsonb_build_object(
    'workflow_id',v_current.workflow_id,'workflow_run_id',v_current.workflow_run_id,
    'workflow_state',v_current.workflow_state,'state_version',v_current.state_version,
    'revision_count',v_current.revision_count,'retry_attempt',v_current.retry_count+1,
    'lease_owner',v_current.lease_owner,'lease_generation',v_current.lease_generation,
    'lease_expires_at',v_current.lease_expires_at,
    'lease_token_sha256',encode(sha256(convert_to(v_current.lease_token::text,'UTF8')),'hex'),
    'checkpoint_namespace',v_current.checkpoint_namespace,'checkpoint_thread_id',v_current.checkpoint_thread_id,
    'input_payload_sha256',v_current.input_payload_sha256,
    'runtime_assignments',COALESCE((SELECT jsonb_agg(to_jsonb(a)-'previous_record_hash'-'record_hash'-'created_at' ORDER BY a.sequence_no)
      FROM callscore_plan_contract.runtime_variant_assignments a WHERE a.workflow_id=p_workflow_id),'[]'::jsonb),
    'delegations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'delegation_id',d.delegation_id,'revision_number',d.revision_number,'delegated_role',d.delegated_role,
      'ordinal',d.ordinal,'child_execution_id',d.child_execution_id,'launch_status',d.launch_status,
      'lease_generation',d.lease_generation,'hermes_session_id',d.hermes_session_id) ORDER BY d.revision_number,d.ordinal)
      FROM callscore_plan_contract.agent_delegations d WHERE d.workflow_id=p_workflow_id),'[]'::jsonb),
    'provider_operations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'operation_id',o.operation_id,'intent_id',o.intent_id,'provider_state',o.provider_state,
      'state_version',o.state_version,'lease_generation',o.lease_generation,'idempotency_key',o.idempotency_key) ORDER BY o.created_at)
      FROM callscore_plan_contract.provider_operations o WHERE o.workflow_id=p_workflow_id),'[]'::jsonb)
  );
  v_to:=CASE WHEN v_current.retry_count>=v_current.max_retries THEN 'FAILED'::callscore_plan_contract.callscore_workflow_state ELSE 'RETRY'::callscore_plan_contract.callscore_workflow_state END;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET workflow_state=v_to,state_version=state_version+1,
      previous_executable_state=CASE WHEN v_to='RETRY' THEN p_from ELSE NULL END,
      retry_at=CASE WHEN v_to='RETRY' THEN p_retry_at ELSE NULL END,
      retry_count=retry_count+1,lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,
      terminal_reason_code=CASE WHEN v_to='FAILED' THEN 'retry_budget_exhausted:'||p_reason ELSE terminal_reason_code END,
      updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.autonomy_workflow_transitions(
    transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,lease_generation,controlled_reason_code,detail
  ) VALUES(gen_random_uuid(),p_workflow_id,v_row.state_version,p_from,v_to,p_expected_version,v_row.state_version,v_row.lease_generation,
    CASE WHEN v_to='FAILED' THEN 'retry_budget_exhausted' ELSE p_reason END,
    jsonb_build_object('retry_at',p_retry_at,'previous_executable_state',p_from,'retry_count',v_row.retry_count,
      'prior_executable_snapshot_sha256',encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex')));
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_retry_sequence
  FROM callscore_plan_contract.autonomy_retry_events WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.autonomy_retry_events(
    retry_event_id,workflow_id,sequence_no,retry_attempt,retry_phase,prior_executable_state,prior_state_version,
    prior_lease_generation,retry_at,controlled_reason_code,exact_prior_executable_snapshot
  ) VALUES(gen_random_uuid(),p_workflow_id,v_retry_sequence,v_row.retry_count,
    CASE WHEN v_to='FAILED' THEN 'EXHAUSTED' ELSE 'SCHEDULED' END,p_from,p_expected_version,
    v_current.lease_generation,p_retry_at,CASE WHEN v_to='FAILED' THEN 'retry_budget_exhausted:'||p_reason ELSE p_reason END,v_snapshot);
  RETURN v_row;
END;
$$;

CREATE FUNCTION resume_due_autonomy_retry(
  p_workflow_id uuid,p_expected_version bigint,p_worker_id text,p_lease_token uuid,p_lease_seconds integer
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_prior callscore_plan_contract.autonomy_workflows; v_row callscore_plan_contract.autonomy_workflows;
        v_retry callscore_plan_contract.autonomy_retry_events; v_retry_sequence bigint;
BEGIN
  IF p_lease_seconds<10 OR p_lease_seconds>900 THEN RAISE EXCEPTION 'invalid lease duration' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_prior FROM callscore_plan_contract.autonomy_workflows
   WHERE workflow_id=p_workflow_id AND workflow_state='RETRY' AND state_version=p_expected_version
     AND lease_owner IS NULL AND retry_at<=clock_timestamp() FOR UPDATE;
  IF v_prior.workflow_id IS NULL OR v_prior.previous_executable_state IS NULL THEN RAISE EXCEPTION 'retry not due/reclaimable' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_retry FROM callscore_plan_contract.autonomy_retry_events
   WHERE workflow_id=p_workflow_id AND retry_attempt=v_prior.retry_count AND retry_phase='SCHEDULED';
  IF v_retry.retry_event_id IS NULL
     OR v_retry.prior_executable_state<>v_prior.previous_executable_state
     OR v_retry.prior_state_version<>p_expected_version-1
     OR v_retry.prior_lease_generation<>v_prior.lease_generation
     OR v_retry.exact_prior_executable_snapshot->>'workflow_id'<>p_workflow_id::text
     OR v_retry.exact_prior_executable_snapshot->>'workflow_run_id'<>v_prior.workflow_run_id::text THEN
    RAISE EXCEPTION 'retry exact prior executable snapshot missing/mismatched' USING ERRCODE='23514';
  END IF;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET workflow_state=v_prior.previous_executable_state,state_version=state_version+1,
      retry_at=NULL,previous_executable_state=NULL,lease_owner=p_worker_id,lease_token=p_lease_token,
      lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.autonomy_workflow_transitions(
    transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,lease_generation,controlled_reason_code
  ) VALUES(gen_random_uuid(),p_workflow_id,v_row.state_version,'RETRY',v_row.workflow_state,p_expected_version,v_row.state_version,v_row.lease_generation,'retry_due_exact_resume');
  INSERT INTO callscore_plan_contract.autonomy_workflow_lease_events(
    lease_event_id,workflow_id,sequence_no,state_version,lease_generation,lease_owner,lease_token,lease_expires_at,controlled_reason_code
  ) VALUES(gen_random_uuid(),p_workflow_id,v_row.lease_generation,v_row.state_version,v_row.lease_generation,p_worker_id,p_lease_token,v_row.lease_expires_at,'retry_resume_claim');
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_retry_sequence
  FROM callscore_plan_contract.autonomy_retry_events WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.autonomy_retry_events(
    retry_event_id,workflow_id,sequence_no,retry_attempt,retry_phase,prior_executable_state,prior_state_version,
    prior_lease_generation,retry_at,controlled_reason_code,exact_prior_executable_snapshot
  ) VALUES(gen_random_uuid(),p_workflow_id,v_retry_sequence,v_retry.retry_attempt,'RESUMED',v_retry.prior_executable_state,
    v_retry.prior_state_version,v_retry.prior_lease_generation,v_retry.retry_at,'retry_due_exact_resume',v_retry.exact_prior_executable_snapshot);
  RETURN v_row;
END;
$$;

CREATE FUNCTION resume_or_reclaim_autonomy_workflow(
  p_workflow_id uuid,p_expected_version bigint,p_expected_lease_generation bigint,p_prior_lease_token uuid,
  p_worker_id text,p_new_lease_token uuid,p_lease_seconds integer
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_prior callscore_plan_contract.autonomy_workflows; v_row callscore_plan_contract.autonomy_workflows; v_reason text;
BEGIN
  IF p_lease_seconds<10 OR p_lease_seconds>900 THEN RAISE EXCEPTION 'invalid lease duration' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_prior FROM callscore_plan_contract.autonomy_workflows
   WHERE workflow_id=p_workflow_id AND state_version=p_expected_version AND lease_generation=p_expected_lease_generation
     AND workflow_state NOT IN ('QUEUED','RETRY','COMPLETE','FAILED') FOR UPDATE;
  IF v_prior.workflow_id IS NULL THEN RAISE EXCEPTION 'workflow recovery CAS failed' USING ERRCODE='40001'; END IF;
  IF v_prior.lease_owner=p_worker_id AND v_prior.lease_token=p_prior_lease_token AND v_prior.lease_expires_at>=clock_timestamp() THEN
    v_reason:='same_identity_resume';
  ELSIF v_prior.lease_expires_at<clock_timestamp() THEN
    v_reason:='expired_lease_reclaim';
  ELSE
    RAISE EXCEPTION 'active lease owned by competitor' USING ERRCODE='40001';
  END IF;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET lease_owner=p_worker_id,lease_token=p_new_lease_token,lease_generation=lease_generation+1,
      lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.autonomy_workflow_lease_events(
    lease_event_id,workflow_id,sequence_no,state_version,lease_generation,prior_lease_owner,lease_owner,lease_token,lease_expires_at,controlled_reason_code
  ) VALUES(gen_random_uuid(),p_workflow_id,v_row.lease_generation,v_row.state_version,v_row.lease_generation,v_prior.lease_owner,p_worker_id,p_new_lease_token,v_row.lease_expires_at,v_reason);
  RETURN v_row;
END;
$$;

CREATE FUNCTION transition_autonomy_workflow(
  p_workflow_id uuid,
  p_from callscore_workflow_state,
  p_to callscore_workflow_state,
  p_expected_version bigint,
  p_lease_token uuid,
  p_reason text
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_current callscore_plan_contract.autonomy_workflows; v_updated callscore_plan_contract.autonomy_workflows; v_count integer;
BEGIN
  SELECT * INTO v_current FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_current.workflow_state<>p_from OR v_current.state_version<>p_expected_version OR v_current.lease_token<>p_lease_token
     OR v_current.lease_expires_at IS NULL OR v_current.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'transition CAS/lease mismatch' USING ERRCODE='40001';
  END IF;
  IF NOT callscore_plan_contract.transition_is_allowed(v_current.execution_class,p_from,p_to) THEN
    RAISE EXCEPTION 'transition not allowed' USING ERRCODE='23514';
  END IF;
  IF p_to='RETRY' OR p_from='RETRY' THEN
    RAISE EXCEPTION 'RETRY is authority-owned by schedule/resume functions' USING ERRCODE='23514';
  END IF;
  IF p_to='REVISION' AND v_current.revision_count>=3 THEN
    UPDATE callscore_plan_contract.autonomy_workflows
    SET workflow_state='FAILED',state_version=state_version+1,lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,
        terminal_reason_code='revision_budget_exhausted',updated_at=clock_timestamp()
    WHERE workflow_id=p_workflow_id RETURNING * INTO v_updated;
    INSERT INTO callscore_plan_contract.autonomy_workflow_transitions(
      transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,lease_generation,controlled_reason_code
    ) VALUES(gen_random_uuid(),p_workflow_id,v_updated.state_version,p_from,'FAILED',p_expected_version,v_updated.state_version,v_updated.lease_generation,'revision_budget_exhausted');
    RETURN v_updated;
  END IF;
  IF p_from='QUALITY_EVALUATION' AND p_to='READY' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.quality_evaluations q
    WHERE q.workflow_id=p_workflow_id AND q.decision='ACCEPT'
      AND q.sequence_no=(SELECT max(sequence_no) FROM callscore_plan_contract.quality_evaluations WHERE workflow_id=p_workflow_id)
  ) THEN RAISE EXCEPTION 'READY requires latest independent ACCEPT' USING ERRCODE='23514'; END IF;
  IF p_from='QUALITY_EVALUATION' AND p_to='REVISION' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.quality_evaluations q
    WHERE q.workflow_id=p_workflow_id AND q.decision='REVISE'
      AND q.sequence_no=(SELECT max(sequence_no) FROM callscore_plan_contract.quality_evaluations WHERE workflow_id=p_workflow_id)
  ) THEN RAISE EXCEPTION 'REVISION requires latest REVISE decision' USING ERRCODE='23514'; END IF;
  IF p_to='HEAD_SYNTHESIS' AND (
    NOT EXISTS(SELECT 1 FROM callscore_plan_contract.workflow_specialist_requirements r WHERE r.workflow_id=p_workflow_id AND r.revision_number=v_current.revision_count AND r.requirement_stage='SYNTHESIS_INPUT')
    OR EXISTS(SELECT 1 FROM callscore_plan_contract.workflow_specialist_requirements r
      WHERE r.workflow_id=p_workflow_id AND r.revision_number=v_current.revision_count AND r.requirement_stage='SYNTHESIS_INPUT'
        AND NOT EXISTS(SELECT 1 FROM callscore_plan_contract.agent_delegations d
          WHERE d.requirement_id=r.requirement_id AND d.launch_status='ACCEPTED'))
    OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.child_join_manifests j
      WHERE j.workflow_id=p_workflow_id AND j.revision_number=v_current.revision_count)
  ) THEN RAISE EXCEPTION 'synthesis requires exact required-child set, ACCEPTED joins, and durable join manifest' USING ERRCODE='23514'; END IF;
  IF p_to='QUALITY_EVALUATION' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.generation_provenance g
    WHERE g.workflow_id=p_workflow_id AND g.delegated_role='head-synthesizer'
  ) THEN RAISE EXCEPTION 'quality evaluation requires head synthesis generation' USING ERRCODE='23514'; END IF;
  IF p_from='REVISION' AND p_to='QUALITY_EVALUATION' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.artifact_revisions r
    WHERE r.workflow_id=p_workflow_id AND r.revision_number=v_current.revision_count
  ) THEN RAISE EXCEPTION 're-evaluation requires hash-linked revision record' USING ERRCODE='23514'; END IF;
  IF p_to='PROVIDER_VERIFIED' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.provider_operations p WHERE p.workflow_id=p_workflow_id AND p.provider_state='VERIFIED'
  ) THEN RAISE EXCEPTION 'provider state requires VERIFIED operation' USING ERRCODE='23514'; END IF;
  IF p_to='OUTCOME_MEASURED' AND NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.outcome_measurements m WHERE m.workflow_id=p_workflow_id
  ) THEN RAISE EXCEPTION 'outcome transition requires durable measurement' USING ERRCODE='23514'; END IF;
  IF p_to='LEARNING_RECORDED' AND (
    SELECT count(DISTINCT artifact_schema) FROM callscore_plan_contract.canonical_learning_artifacts WHERE workflow_id=p_workflow_id
  )<>4 THEN RAISE EXCEPTION 'learning transition requires exact four-artifact set' USING ERRCODE='23514'; END IF;
  IF p_to='COMPLETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM callscore_plan_contract.quality_evaluations q
      JOIN callscore_plan_contract.generation_provenance e ON e.generation_id=q.evaluator_generation_id
      JOIN callscore_plan_contract.generation_provenance g ON g.generation_id=q.generation_id
      WHERE q.workflow_id=p_workflow_id AND q.decision='ACCEPT'
        AND e.producer_agent_id<>g.producer_agent_id AND e.hermes_session_id IS DISTINCT FROM g.hermes_session_id
    ) THEN RAISE EXCEPTION 'completion requires independent accepted evaluation' USING ERRCODE='23514'; END IF;
    SELECT count(DISTINCT artifact_schema) INTO v_count FROM callscore_plan_contract.canonical_learning_artifacts WHERE workflow_id=p_workflow_id;
    IF v_count<>4 OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.outcome_measurements WHERE workflow_id=p_workflow_id) THEN
      RAISE EXCEPTION 'completion requires outcome plus four learning artifacts' USING ERRCODE='23514';
    END IF;
    IF v_current.execution_class='OWNED_PUBLIC_MUTATION' AND NOT EXISTS(
      SELECT 1 FROM callscore_plan_contract.provider_operations WHERE workflow_id=p_workflow_id AND provider_state='VERIFIED'
    ) THEN RAISE EXCEPTION 'mutating completion requires provider verification' USING ERRCODE='23514'; END IF;
    IF v_current.execution_class<>'OWNED_PUBLIC_MUTATION' AND EXISTS(
      SELECT 1 FROM callscore_plan_contract.provider_operations WHERE workflow_id=p_workflow_id
    ) THEN RAISE EXCEPTION 'non-mutating completion forbids provider operation' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET workflow_state=p_to,state_version=state_version+1,
      revision_count=revision_count+CASE WHEN p_to='REVISION' THEN 1 ELSE 0 END,
      achievement_class=CASE WHEN p_to='COMPLETE' AND execution_class='OWNED_PUBLIC_MUTATION' THEN 'VERIFIED'::callscore_plan_contract.callscore_achievement_class
                             WHEN p_to='COMPLETE' AND execution_class IN ('RESTRICTED_DRAFT','INTERNAL_ARTIFACT') THEN 'DRAFTED'::callscore_plan_contract.callscore_achievement_class
                             WHEN p_to='COMPLETE' AND execution_class='READ_ONLY_OBSERVATION' THEN 'OBSERVED'::callscore_plan_contract.callscore_achievement_class
                             ELSE achievement_class END,
      terminal_reason_code=CASE WHEN p_to IN ('COMPLETE','FAILED') THEN p_reason ELSE terminal_reason_code END,
      updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id
  RETURNING * INTO v_updated;
  INSERT INTO callscore_plan_contract.autonomy_workflow_transitions(
    transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,
    lease_generation,controlled_reason_code
  ) VALUES (gen_random_uuid(),p_workflow_id,v_updated.state_version,p_from,p_to,p_expected_version,v_updated.state_version,v_updated.lease_generation,p_reason);
  RETURN v_updated;
END;
$$;

CREATE FUNCTION heartbeat_autonomy_workflow(
  p_workflow_id uuid,
  p_expected_state_version bigint,
  p_expected_heartbeat_seq bigint,
  p_lease_token uuid,
  p_lease_seconds integer
) RETURNS autonomy_workflows
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_row callscore_plan_contract.autonomy_workflows;
BEGIN
  IF p_lease_seconds < 10 OR p_lease_seconds > 900 THEN RAISE EXCEPTION 'invalid heartbeat lease duration'; END IF;
  UPDATE callscore_plan_contract.autonomy_workflows
  SET lease_heartbeat_seq=lease_heartbeat_seq+1,
      lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
      updated_at=clock_timestamp()
  WHERE workflow_id=p_workflow_id AND state_version=p_expected_state_version
    AND lease_heartbeat_seq=p_expected_heartbeat_seq AND lease_token=p_lease_token
    AND lease_expires_at>clock_timestamp()
    AND workflow_state NOT IN ('COMPLETE','FAILED')
  RETURNING * INTO v_row;
  IF v_row.workflow_id IS NULL THEN RAISE EXCEPTION 'heartbeat CAS/lease mismatch' USING ERRCODE='40001'; END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION create_provider_operation_intent(
  p_intent_id uuid,p_workflow_id uuid,p_account_scope_hash char(64),p_mutation_family text,
  p_provider_tool text,p_action_name text,p_payload_artifact_id uuid,p_is_media boolean,p_is_youtube boolean,
  p_rollback_artifact_id uuid,p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_payload callscore_plan_contract.autonomy_artifacts;
        v_rollback callscore_plan_contract.autonomy_artifacts; v_seq bigint;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_payload FROM callscore_plan_contract.autonomy_artifacts
   WHERE artifact_id=p_payload_artifact_id AND artifact_kind='provider_payload';
  SELECT * INTO v_rollback FROM callscore_plan_contract.autonomy_artifacts
   WHERE artifact_id=p_rollback_artifact_id AND artifact_kind='provider_object_rollback_contract';
  IF v_w.workflow_state<>'READY' OR v_w.execution_class<>'OWNED_PUBLIC_MUTATION'
     OR v_payload.artifact_id IS NULL OR v_rollback.artifact_id IS NULL OR p_expires_at<=clock_timestamp()
     OR (p_is_youtube AND NOT p_is_media) THEN
    RAISE EXCEPTION 'provider intent durable lineage/state predicate failed' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.provider_operation_intents WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.provider_operation_intents(
    intent_id,workflow_id,sequence_no,publication_revision,account_scope_hash,mutation_family,provider_tool,
    action_name,payload_artifact_id,payload_sha256,is_media,is_youtube,rollback_artifact_id,expires_at
  ) VALUES(p_intent_id,p_workflow_id,v_seq,v_w.revision_count,p_account_scope_hash,p_mutation_family,p_provider_tool,
    p_action_name,p_payload_artifact_id,v_payload.content_sha256,p_is_media,p_is_youtube,p_rollback_artifact_id,p_expires_at);
  RETURN p_intent_id;
END;
$$;

CREATE FUNCTION mint_ready_public_owned_grant(p_workflow_id uuid,p_intent_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_i callscore_plan_contract.provider_operation_intents;
        v_policy callscore_plan_contract.canonical_policy_snapshots; v_grant uuid:=gen_random_uuid(); v_required text[]; v_schema text; v_sequence bigint;
BEGIN
  IF (SELECT fenced FROM callscore_plan_contract.autonomy_activation_fence WHERE singleton=true) THEN RAISE EXCEPTION 'activation fenced'; END IF;
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_i FROM callscore_plan_contract.provider_operation_intents WHERE intent_id=p_intent_id AND workflow_id=p_workflow_id;
  IF v_w.workflow_state<>'READY' OR v_w.execution_class<>'OWNED_PUBLIC_MUTATION' OR v_i.intent_id IS NULL OR v_i.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'workflow/intent not grant eligible' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_policy FROM callscore_plan_contract.canonical_policy_snapshots
   WHERE channel=v_w.channel AND account_scope_hash=v_i.account_scope_hash AND provider_tool=v_i.provider_tool
     AND mutation_family=v_i.mutation_family AND action_name=v_i.action_name AND readiness_status='READY_PUBLIC_OWNED'
     AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()
   ORDER BY sequence_no DESC LIMIT 1;
  IF v_policy.policy_snapshot_id IS NULL THEN RAISE EXCEPTION 'no exact active policy'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM callscore_plan_contract.autonomy_artifacts a
    JOIN callscore_plan_contract.verified_evidence_bindings b ON b.evidence_artifact_id=a.artifact_id
    WHERE a.artifact_id=v_i.rollback_artifact_id AND a.artifact_kind='provider_object_rollback_contract'
      AND b.subject_kind='provider_rollback_contract' AND b.subject_id=v_i.intent_id::text
      AND b.subject_sha256=a.content_sha256 AND b.validation_schema='provider-object-rollback-contract.v1'
      AND b.validation_status='PASS'
  ) THEN RAISE EXCEPTION 'provider rollback contract lacks exact independent validation' USING ERRCODE='23514'; END IF;
  v_required:=ARRAY['editorial_angle_receipt.v1','platform_fit_receipt.v1','visual_brief_receipt.v1','visual_qa_receipt.v1','copy_visual_coherence_receipt.v1','same_shit_memory_receipt.v1','callscore.task_router_receipt.v1','callscore.tool_inheritance_receipt.v1'];
  IF v_i.is_media THEN v_required:=v_required||ARRAY['callscore.design_bundle_reference_receipt.v1','callscore.website_design_alignment_receipt.v2','callscore.branding_receipt.v2','callscore.brand_lockup_occlusion_check.v1','callscore.media_artifact_receipt.v2']; END IF;
  IF v_i.is_youtube THEN v_required:=v_required||ARRAY['youtube_script_receipt.v1','youtube_packaging_receipt.v1','youtube_thumbnail_receipt.v1','youtube_publish_package_receipt.v1','youtube_analytics_receipt.v1']; END IF;
  FOREACH v_schema IN ARRAY v_required LOOP
    IF NOT EXISTS(
      SELECT 1 FROM callscore_plan_contract.canonical_receipt_evidence e
      JOIN callscore_plan_contract.verified_evidence_bindings b ON b.evidence_artifact_id=e.receipt_artifact_id
      WHERE e.workflow_id=p_workflow_id AND e.receipt_schema=v_schema AND e.status='PASS' AND e.stale_at>clock_timestamp()
        AND b.subject_kind='canonical_operational_receipt'
        AND b.subject_id=p_workflow_id::text||':'||v_schema
        AND b.subject_sha256=v_i.payload_sha256
        AND b.validation_schema=v_schema AND b.verifier_agent_id=e.verifier_agent_id
    ) THEN
      RAISE EXCEPTION 'missing/stale receipt %',v_schema USING ERRCODE='23514';
    END IF;
  END LOOP;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_sequence
  FROM callscore_plan_contract.external_action_grants WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.external_action_grants(
    grant_id,workflow_id,intent_id,sequence_no,authority_source,policy_snapshot_id,account_scope_hash,
    mutation_family,provider_tool,action_name,publication_revision,payload_sha256,issued_by_role,issued_at,expires_at
  ) VALUES (v_grant,p_workflow_id,p_intent_id,v_sequence,'READY_PUBLIC_OWNED_POLICY',v_policy.policy_snapshot_id,
    v_i.account_scope_hash,v_i.mutation_family,v_i.provider_tool,v_i.action_name,v_i.publication_revision,
    v_i.payload_sha256,'callscore_function_owner',clock_timestamp(),LEAST(v_i.expires_at,clock_timestamp()+interval '15 minutes'));
  RETURN v_grant;
END;
$$;

CREATE FUNCTION revoke_external_action_grant(p_grant_id uuid,p_controlled_reason_code text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_grant callscore_plan_contract.external_action_grants;
BEGIN
  SELECT * INTO v_grant FROM callscore_plan_contract.external_action_grants WHERE grant_id=p_grant_id FOR UPDATE;
  IF v_grant.grant_id IS NULL OR EXISTS(SELECT 1 FROM callscore_plan_contract.external_action_grant_revocations WHERE grant_id=p_grant_id)
     OR p_controlled_reason_code IS NULL OR p_controlled_reason_code='' THEN
    RAISE EXCEPTION 'grant revocation predicate failed' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.external_action_grant_revocations(
    revocation_id,grant_id,sequence_no,controlled_reason_code,revoked_by_role
  ) VALUES(gen_random_uuid(),p_grant_id,1,p_controlled_reason_code,'callscore_plan_policy_writer');
  RETURN p_grant_id;
END;
$$;

CREATE FUNCTION record_generation_provenance(
  p_generation_id uuid,p_workflow_id uuid,p_delegation_id uuid,p_join_manifest_id uuid,p_evaluated_generation_id uuid,
  p_producer_agent_id text,p_delegated_role text,
  p_hermes_session_id text,p_prompt_name text,p_prompt_version text,p_resolved_prompt_artifact_id uuid,
  p_prompt_secret_scan_artifact_id uuid,p_model text,p_provider text,p_parameters jsonb,p_toolsets jsonb,
  p_tools_manifest_sha256 char(64),p_skills jsonb,p_skills_manifest_sha256 char(64),p_input_evidence_sha256 jsonb,
  p_output_artifact_id uuid,p_token_usage jsonb,p_cost_usd numeric,p_started_at timestamptz,p_finished_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_a callscore_plan_contract.runtime_variant_assignments;
        v_d callscore_plan_contract.agent_delegations; v_prompt callscore_plan_contract.autonomy_artifacts;
        v_event callscore_plan_contract.agent_delegation_events; v_output callscore_plan_contract.autonomy_artifacts;
        v_variant callscore_plan_contract.runtime_variants; v_seq bigint; v_join callscore_plan_contract.child_join_manifests;
        v_evaluated callscore_plan_contract.generation_provenance; v_expected_input jsonb;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_a FROM callscore_plan_contract.runtime_variant_assignments
   WHERE workflow_id=p_workflow_id AND producer_agent_id=p_producer_agent_id AND delegated_role=p_delegated_role;
  SELECT * INTO v_variant FROM callscore_plan_contract.runtime_variants WHERE variant_id=v_a.variant_id;
  SELECT * INTO v_prompt FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_resolved_prompt_artifact_id;
  SELECT * INTO v_output FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_output_artifact_id;
  IF v_w.workflow_id IS NULL OR v_a.assignment_id IS NULL OR v_variant.variant_id IS NULL OR v_prompt.artifact_id IS NULL OR v_output.artifact_id IS NULL
     OR p_hermes_session_id IS NULL OR p_finished_at<p_started_at
     OR p_prompt_name IS DISTINCT FROM v_variant.prompt_name
     OR p_prompt_version IS DISTINCT FROM v_variant.prompt_version
     OR v_prompt.content_sha256 IS DISTINCT FROM v_variant.prompt_sha256
     OR p_model IS DISTINCT FROM v_variant.model OR p_provider IS DISTINCT FROM v_variant.provider
     OR p_parameters IS DISTINCT FROM v_variant.parameters
     OR p_tools_manifest_sha256 IS DISTINCT FROM v_variant.tools_manifest_sha256
     OR p_skills_manifest_sha256 IS DISTINCT FROM v_variant.skills_manifest_sha256
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_prompt_secret_scan_artifact_id AND artifact_kind='prompt_secret_scan_receipt') THEN
    RAISE EXCEPTION 'generation lineage/artifact/time predicate failed' USING ERRCODE='23514';
  END IF;
  IF p_delegation_id IS NOT NULL THEN
    SELECT * INTO v_d FROM callscore_plan_contract.agent_delegations
     WHERE delegation_id=p_delegation_id AND workflow_id=p_workflow_id AND launch_status='ACCEPTED'
       AND canonical_child_agent_id=p_producer_agent_id AND delegated_role=p_delegated_role
       AND hermes_session_id=p_hermes_session_id;
    SELECT * INTO v_event FROM callscore_plan_contract.agent_delegation_events
     WHERE delegation_id=p_delegation_id AND status='ACCEPTED' ORDER BY sequence_no DESC LIMIT 1;
    IF v_d.delegation_id IS NULL
       OR v_event.output_artifact_id IS DISTINCT FROM p_output_artifact_id
       OR v_event.output_sha256 IS DISTINCT FROM v_output.content_sha256 THEN
      RAISE EXCEPTION 'generation delegation identity/output not ACCEPTED' USING ERRCODE='23514';
    END IF;
  ELSIF p_delegated_role<>'head-synthesizer' OR p_producer_agent_id<>v_w.head_agent_id THEN
    RAISE EXCEPTION 'only canonical head synthesis may omit delegation' USING ERRCODE='23514';
  END IF;
  IF p_delegated_role='head-synthesizer' THEN
    SELECT * INTO v_join FROM callscore_plan_contract.child_join_manifests
      WHERE join_manifest_id=p_join_manifest_id AND workflow_id=p_workflow_id AND revision_number=v_w.revision_count;
    SELECT jsonb_object_agg(m.requirement_id::text,m.output_sha256 ORDER BY m.requirement_id::text) INTO v_expected_input
      FROM callscore_plan_contract.child_join_manifest_members m WHERE m.join_manifest_id=p_join_manifest_id;
    IF v_join.join_manifest_id IS NULL OR p_evaluated_generation_id IS NOT NULL OR p_input_evidence_sha256 IS DISTINCT FROM v_expected_input THEN
      RAISE EXCEPTION 'head synthesis input must equal exact accepted child join manifest' USING ERRCODE='23514';
    END IF;
  ELSIF p_delegated_role IN ('evaluator','trust-reviewer') THEN
    SELECT * INTO v_evaluated FROM callscore_plan_contract.generation_provenance
      WHERE generation_id=p_evaluated_generation_id AND workflow_id=p_workflow_id AND delegated_role='head-synthesizer';
    v_expected_input:=jsonb_build_object('evaluated_generation_id',p_evaluated_generation_id,'evaluated_output_sha256',v_evaluated.output_sha256);
    IF v_evaluated.generation_id IS NULL OR p_join_manifest_id IS NOT NULL
       OR p_input_evidence_sha256 IS DISTINCT FROM v_expected_input OR p_started_at<v_evaluated.finished_at
       OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.agent_delegation_events e
          WHERE e.delegation_id=p_delegation_id AND e.status='ACCEPTED' AND e.created_at>=v_evaluated.finished_at) THEN
      RAISE EXCEPTION 'evaluator must causally follow and consume exact synthesized candidate' USING ERRCODE='23514';
    END IF;
  ELSIF p_join_manifest_id IS NOT NULL OR p_evaluated_generation_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-head/non-evaluator generation supplied forbidden causal binding' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.generation_provenance WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.generation_provenance(
    generation_id,workflow_id,workflow_run_id,sequence_no,delegation_id,join_manifest_id,evaluated_generation_id,producer_agent_id,delegated_role,channel,task_type,
    hermes_session_id,prompt_name,prompt_version,prompt_sha256,resolved_prompt_artifact_id,prompt_secret_scan_artifact_id,
    model,provider,parameters,toolsets,tools_manifest_sha256,skills,skills_manifest_sha256,registry_version,policy_version,
    experiment_id,cohort_id,variant_id,input_evidence_sha256,output_artifact_id,output_sha256,token_usage,cost_usd,started_at,finished_at
  ) VALUES (
    p_generation_id,p_workflow_id,v_w.workflow_run_id,v_seq,p_delegation_id,p_join_manifest_id,p_evaluated_generation_id,p_producer_agent_id,p_delegated_role,v_w.channel,v_w.task_type,
    p_hermes_session_id,p_prompt_name,p_prompt_version,v_prompt.content_sha256,p_resolved_prompt_artifact_id,p_prompt_secret_scan_artifact_id,
    p_model,p_provider,p_parameters,p_toolsets,p_tools_manifest_sha256,p_skills,p_skills_manifest_sha256,v_a.registry_version,v_w.policy_version,
    v_a.experiment_id,v_a.cohort_id,v_a.variant_id,p_input_evidence_sha256,p_output_artifact_id,v_output.content_sha256,p_token_usage,p_cost_usd,p_started_at,p_finished_at
  );
  RETURN p_generation_id;
END;
$$;

CREATE FUNCTION record_quality_gate_evidence(
  p_gate_evidence_id uuid,p_workflow_id uuid,p_generation_id uuid,p_gate_name text,
  p_passed boolean,p_evidence_artifact_id uuid,p_verifier_agent_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_generation callscore_plan_contract.generation_provenance; v_artifact callscore_plan_contract.autonomy_artifacts; v_seq bigint;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_generation FROM callscore_plan_contract.generation_provenance
   WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_artifact FROM callscore_plan_contract.autonomy_artifacts
   WHERE artifact_id=p_evidence_artifact_id AND artifact_kind='quality_gate:'||p_gate_name;
  IF v_generation.generation_id IS NULL OR v_artifact.artifact_id IS NULL
     OR v_artifact.verified_by_agent_id<>p_verifier_agent_id
     OR p_verifier_agent_id=v_generation.producer_agent_id THEN
    RAISE EXCEPTION 'quality gate evidence identity/binding failed' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
    WHERE b.evidence_artifact_id=p_evidence_artifact_id
      AND b.subject_kind='generation_quality_gate'
      AND b.subject_id=p_generation_id::text||':'||p_gate_name
      AND b.subject_sha256=v_generation.output_sha256
      AND b.validation_schema='quality-gate:'||p_gate_name||'.v1'
      AND b.verifier_agent_id=p_verifier_agent_id
  ) THEN
    RAISE EXCEPTION 'quality gate lacks independently authenticated subject binding' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.quality_gate_evidence WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.quality_gate_evidence(
    gate_evidence_id,workflow_id,generation_id,sequence_no,gate_name,passed,evidence_artifact_id,verifier_agent_id
  ) VALUES(p_gate_evidence_id,p_workflow_id,p_generation_id,v_seq,p_gate_name,p_passed,p_evidence_artifact_id,p_verifier_agent_id);
  RETURN p_gate_evidence_id;
END;
$$;

CREATE FUNCTION record_quality_evaluation(
  p_evaluation_id uuid,
  p_workflow_id uuid,
  p_generation_id uuid,
  p_evaluator_generation_id uuid,
  p_dimension_scores jsonb,
  p_similarity numeric,
  p_similarity_threshold numeric,
  p_controlled_reason_code text
) RETURNS quality_evaluations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_candidate callscore_plan_contract.generation_provenance; v_evaluator callscore_plan_contract.generation_provenance;
        v_weighted numeric; v_decision text; v_seq bigint; v_row callscore_plan_contract.quality_evaluations; v_deterministic_pass boolean;
        v_keys text[]:=ARRAY['factual_accuracy','evidence_support','originality','platform_fit','clarity','callscore_voice','commercial_strength','actionability','handoff_readiness','hook','argument','native_structure','audience_relevance','cta','safety_compliance'];
        v_key text;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_candidate FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_evaluator FROM callscore_plan_contract.generation_provenance
   WHERE generation_id=p_evaluator_generation_id AND workflow_id=p_workflow_id AND delegated_role IN ('evaluator','trust-reviewer');
  IF v_candidate.generation_id IS NULL OR v_evaluator.generation_id IS NULL
     OR v_evaluator.evaluated_generation_id IS DISTINCT FROM v_candidate.generation_id
     OR v_candidate.producer_agent_id=v_evaluator.producer_agent_id
     OR v_candidate.hermes_session_id IS NOT DISTINCT FROM v_evaluator.hermes_session_id
     OR p_similarity<0 OR p_similarity>1 OR p_similarity_threshold<=0 OR p_similarity_threshold>1 THEN
    RAISE EXCEPTION 'evaluation identity/similarity predicate failed' USING ERRCODE='23514';
  END IF;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT (p_dimension_scores ? v_key) OR (p_dimension_scores->>v_key)::numeric NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'missing/invalid quality dimension %',v_key USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(p_dimension_scores))<>cardinality(v_keys) THEN
    RAISE EXCEPTION 'unexpected quality dimension' USING ERRCODE='23514';
  END IF;
  v_weighted:=
      (p_dimension_scores->>'factual_accuracy')::numeric*0.15
    + (p_dimension_scores->>'evidence_support')::numeric*0.15
    + (p_dimension_scores->>'originality')::numeric*0.08
    + (p_dimension_scores->>'platform_fit')::numeric*0.07
    + (p_dimension_scores->>'clarity')::numeric*0.07
    + (p_dimension_scores->>'callscore_voice')::numeric*0.07
    + (p_dimension_scores->>'commercial_strength')::numeric*0.05
    + (p_dimension_scores->>'actionability')::numeric*0.06
    + (p_dimension_scores->>'handoff_readiness')::numeric*0.05
    + (p_dimension_scores->>'hook')::numeric*0.06
    + (p_dimension_scores->>'argument')::numeric*0.06
    + (p_dimension_scores->>'native_structure')::numeric*0.05
    + (p_dimension_scores->>'audience_relevance')::numeric*0.04
    + (p_dimension_scores->>'cta')::numeric*0.04;
  SELECT count(*)=5 AND bool_and(passed) INTO v_deterministic_pass
  FROM callscore_plan_contract.quality_gate_evidence
  WHERE workflow_id=p_workflow_id AND generation_id=p_generation_id
    AND gate_name IN ('claim_policy','canonical_receipts','secrets','originality','destination_fit');
  v_decision:=CASE WHEN v_deterministic_pass
    AND (p_dimension_scores->>'factual_accuracy')::numeric>=0.95
    AND (p_dimension_scores->>'evidence_support')::numeric>=0.95
    AND (p_dimension_scores->>'safety_compliance')::numeric=1
    AND NOT EXISTS(
      SELECT 1 FROM unnest(ARRAY['originality','platform_fit','clarity','callscore_voice','commercial_strength','actionability','handoff_readiness','hook','argument','native_structure','audience_relevance','cta']) k
      WHERE (p_dimension_scores->>k)::numeric<0.80
    )
    AND v_weighted>=0.86 AND p_similarity<p_similarity_threshold THEN 'ACCEPT'
    WHEN NOT v_deterministic_pass OR (p_dimension_scores->>'safety_compliance')::numeric<1 THEN 'REJECT'
    ELSE 'REVISE' END;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.quality_evaluations WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.quality_evaluations(
    evaluation_id,workflow_id,sequence_no,generation_id,evaluator_generation_id,evaluator_agent_id,decision,
    deterministic_gates,semantic_scores,similarity_score,similarity_threshold,weighted_score,
    acceptance_thresholds,controlled_reason_codes
  ) VALUES (p_evaluation_id,p_workflow_id,v_seq,p_generation_id,p_evaluator_generation_id,v_evaluator.producer_agent_id,
    v_decision::callscore_plan_contract.callscore_evaluation_decision,
    (SELECT jsonb_object_agg(gate_name,jsonb_build_object('passed',passed,'evidence_artifact_id',evidence_artifact_id,'verifier_agent_id',verifier_agent_id))
     FROM callscore_plan_contract.quality_gate_evidence WHERE workflow_id=p_workflow_id AND generation_id=p_generation_id),
    p_dimension_scores,p_similarity,p_similarity_threshold,v_weighted,
    jsonb_build_object('factual_accuracy',0.95,'evidence_support',0.95,'safety_compliance',1,'other_dimensions',0.80,'weighted_mean',0.86),
    jsonb_build_array(p_controlled_reason_code))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE FUNCTION record_artifact_revision(
  p_revision_id uuid,p_workflow_id uuid,p_source_generation_id uuid,p_source_evaluation_id uuid,
  p_revised_generation_id uuid,p_controlled_reason_codes jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_w.workflow_state<>'REVISION' OR v_w.revision_count NOT BETWEEN 1 AND 3
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.quality_evaluations q
       WHERE q.evaluation_id=p_source_evaluation_id AND q.workflow_id=p_workflow_id
         AND q.generation_id=p_source_generation_id AND q.decision='REVISE'
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.generation_provenance g
       WHERE g.generation_id=p_revised_generation_id AND g.workflow_id=p_workflow_id
         AND g.sequence_no>(SELECT sequence_no FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_source_generation_id)
     ) THEN RAISE EXCEPTION 'revision lineage/state predicate failed' USING ERRCODE='23514'; END IF;
  INSERT INTO callscore_plan_contract.artifact_revisions(
    revision_id,workflow_id,sequence_no,source_generation_id,source_evaluation_id,revised_generation_id,
    revision_number,controlled_reason_codes
  ) VALUES (p_revision_id,p_workflow_id,v_w.revision_count,p_source_generation_id,p_source_evaluation_id,
    p_revised_generation_id,v_w.revision_count,p_controlled_reason_codes);
  RETURN p_revision_id;
END;
$$;

CREATE FUNCTION create_provider_operation(
  p_operation_id uuid,p_workflow_id uuid,p_generation_id uuid,p_accepted_evaluation_id uuid,
  p_intent_id uuid,p_grant_id uuid,p_worker_id text,p_lease_token uuid
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_i callscore_plan_contract.provider_operation_intents; v_g callscore_plan_contract.external_action_grants;
        v_o callscore_plan_contract.provider_operations; v_w callscore_plan_contract.autonomy_workflows;
        v_generation callscore_plan_contract.generation_provenance; v_evaluation callscore_plan_contract.quality_evaluations; v_key text;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_generation FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_evaluation FROM callscore_plan_contract.quality_evaluations
   WHERE evaluation_id=p_accepted_evaluation_id AND workflow_id=p_workflow_id AND generation_id=p_generation_id AND decision='ACCEPT';
  SELECT * INTO v_i FROM callscore_plan_contract.provider_operation_intents WHERE intent_id=p_intent_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_g FROM callscore_plan_contract.external_action_grants WHERE grant_id=p_grant_id AND workflow_id=p_workflow_id AND intent_id=p_intent_id FOR UPDATE;
  IF v_w.workflow_state<>'EXECUTING' OR v_generation.generation_id IS NULL OR v_evaluation.evaluation_id IS NULL
     OR v_i.intent_id IS NULL OR v_g.grant_id IS NULL OR v_g.expires_at<=clock_timestamp()
     OR EXISTS(SELECT 1 FROM callscore_plan_contract.external_action_grant_revocations WHERE grant_id=p_grant_id) THEN
    RAISE EXCEPTION 'invalid/revoked/expired exact grant' USING ERRCODE='23514';
  END IF;
  v_key:=encode(sha256(convert_to(jsonb_build_object(
    'workflow_id',p_workflow_id,'publication_revision',v_i.publication_revision,'account_scope_hash',v_i.account_scope_hash,
    'provider_tool',v_i.provider_tool,'action_name',v_i.action_name,'payload_sha256',v_i.payload_sha256
  )::text,'UTF8')),'hex');
  INSERT INTO callscore_plan_contract.provider_operations(
    operation_id,workflow_id,generation_id,accepted_evaluation_id,intent_id,authority_grant_id,publication_revision,account_scope_hash,
    provider_tool,action_name,payload_sha256,idempotency_key,provider_state,lease_owner,lease_token,lease_generation,lease_expires_at
  ) VALUES (p_operation_id,p_workflow_id,p_generation_id,p_accepted_evaluation_id,p_intent_id,p_grant_id,v_i.publication_revision,v_i.account_scope_hash,
    v_i.provider_tool,v_i.action_name,v_i.payload_sha256,v_key,'CLAIMED',p_worker_id,p_lease_token,1,clock_timestamp()+interval '2 minutes')
  RETURNING * INTO v_o;
  INSERT INTO callscore_plan_contract.provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code)
  VALUES (gen_random_uuid(),p_operation_id,1,'INTENT','CLAIMED','exact_grant_consumed');
  INSERT INTO callscore_plan_contract.provider_operation_lease_events(
    lease_event_id,operation_id,sequence_no,lease_generation,lease_owner,lease_token,lease_expires_at,controlled_reason_code
  ) VALUES (gen_random_uuid(),p_operation_id,1,1,p_worker_id,p_lease_token,v_o.lease_expires_at,'initial_provider_claim');
  RETURN v_o;
END;
$$;

CREATE FUNCTION mark_provider_dispatching(p_operation_id uuid,p_expected_version bigint,p_lease_token uuid) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_o callscore_plan_contract.provider_operations;
BEGIN
  UPDATE callscore_plan_contract.provider_operations SET provider_state='DISPATCHING',state_version=state_version+1,updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id AND provider_state='CLAIMED' AND state_version=p_expected_version
    AND lease_token=p_lease_token AND lease_expires_at>clock_timestamp()
    AND EXISTS(
      SELECT 1 FROM callscore_plan_contract.external_action_grants g
      WHERE g.grant_id=provider_operations.authority_grant_id
        AND g.workflow_id=provider_operations.workflow_id AND g.intent_id=provider_operations.intent_id
        AND g.expires_at>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM callscore_plan_contract.external_action_grant_revocations r WHERE r.grant_id=g.grant_id)
    )
  RETURNING * INTO v_o;
  IF v_o.operation_id IS NULL THEN RAISE EXCEPTION 'dispatch boundary CAS failed' USING ERRCODE='40001'; END IF;
  INSERT INTO callscore_plan_contract.provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code,dispatch_boundary_at)
  VALUES(gen_random_uuid(),p_operation_id,v_o.state_version+1,'CLAIMED','DISPATCHING','network_dispatch_may_begin',clock_timestamp());
  RETURN v_o;
END;
$$;

CREATE FUNCTION record_review_execution_attestation(
  p_review_execution_id uuid,p_target_app_commit_sha char(40),p_target_plan_commit_sha char(40),
  p_target_deployment_manifest_sha256 char(64),p_review_scope text,p_reviewer_agent_id text,
  p_hermes_session_id text,p_delegation_batch_id text,p_delegation_task_ordinal smallint,
  p_process_identity_artifact_id uuid,p_review_output_artifact_id uuid,p_reviewed_subject_sha256 char(64),p_verdict text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
       WHERE artifact_id=p_process_identity_artifact_id AND artifact_kind='hermes_review_process_identity')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
       WHERE artifact_id=p_review_output_artifact_id AND artifact_kind='autonomy_independent_review_receipt.v2'
         AND created_by_agent_id=p_reviewer_agent_id)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_process_identity_artifact_id AND b.subject_kind='review_execution_identity'
         AND b.subject_id=p_review_execution_id::text AND b.subject_sha256=p_target_deployment_manifest_sha256
         AND b.validation_schema='review-execution-identity.v1')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_review_output_artifact_id AND b.subject_kind='autonomy_review'
         AND b.subject_id=p_review_execution_id::text AND b.subject_sha256=p_target_deployment_manifest_sha256
         AND b.validation_schema='independent-review-receipt.v1') THEN
    RAISE EXCEPTION 'review identity attestation requires authenticated role and exact runtime artifacts' USING ERRCODE='42501';
  END IF;
  INSERT INTO callscore_plan_contract.review_execution_attestations(
    review_execution_id,target_app_commit_sha,target_plan_commit_sha,target_deployment_manifest_sha256,review_scope,
    reviewer_agent_id,hermes_session_id,delegation_batch_id,delegation_task_ordinal,process_identity_artifact_id,
    review_output_artifact_id,reviewed_subject_sha256,verdict,attested_by_role
  ) VALUES(p_review_execution_id,p_target_app_commit_sha,p_target_plan_commit_sha,p_target_deployment_manifest_sha256,p_review_scope,
    p_reviewer_agent_id,p_hermes_session_id,p_delegation_batch_id,p_delegation_task_ordinal,p_process_identity_artifact_id,
    p_review_output_artifact_id,p_reviewed_subject_sha256,p_verdict,'callscore_plan_review_identity_attestor');
  RETURN p_review_execution_id;
END;
$$;

CREATE FUNCTION record_autonomy_review_receipt(
  p_review_receipt_id uuid,p_review_execution_id uuid,p_phase text,p_reviewed_subject_sha256 char(64),
  p_receipt_artifact_id uuid,p_receipt_sha256 char(64),p_verifier_agent_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_attestation callscore_plan_contract.review_execution_attestations;
BEGIN
  SELECT * INTO v_attestation FROM callscore_plan_contract.review_execution_attestations
   WHERE review_execution_id=p_review_execution_id AND verdict='PASS';
  IF v_attestation.review_execution_id IS NULL OR v_attestation.reviewed_subject_sha256<>p_reviewed_subject_sha256
     OR v_attestation.reviewer_agent_id=p_verifier_agent_id
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
       WHERE artifact_id=p_receipt_artifact_id AND content_sha256=p_receipt_sha256
         AND artifact_kind='autonomy_independent_review_receipt.v2' AND verified_by_agent_id=p_verifier_agent_id) THEN
    RAISE EXCEPTION 'review receipt lacks exact authenticated reviewer/subject binding' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.autonomy_review_receipts(
    review_receipt_id,review_execution_id,phase,reviewed_subject_sha256,receipt_artifact_id,receipt_sha256,verifier_agent_id,status
  ) VALUES(p_review_receipt_id,p_review_execution_id,p_phase,p_reviewed_subject_sha256,p_receipt_artifact_id,p_receipt_sha256,p_verifier_agent_id,'PASS');
  RETURN p_review_receipt_id;
END;
$$;

CREATE FUNCTION record_provider_object_rollback_receipt(
  p_rollback_receipt_id uuid,p_report_stream_id text,p_report_sequence_no bigint,p_deployment_manifest_sha256 char(64),
  p_workflow_id uuid,p_operation_id uuid,p_receipt_artifact_id uuid,p_verified_at timestamptz,p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, callscore_plan_contract AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.provider_operations
       WHERE operation_id=p_operation_id AND workflow_id=p_workflow_id AND provider_state='VERIFIED')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_receipt_artifact_id AND b.subject_kind='provider_object_rollback'
         AND b.subject_id=p_operation_id::text AND b.subject_sha256=p_deployment_manifest_sha256
         AND b.validation_schema='provider-object-rollback.v2') THEN
    RAISE EXCEPTION 'provider rollback receipt exact relation failed' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM callscore_plan_contract.provider_object_rollback_receipts WHERE operation_id=p_operation_id) THEN
    IF EXISTS(SELECT 1 FROM callscore_plan_contract.provider_object_rollback_receipts
      WHERE operation_id=p_operation_id AND report_stream_id=p_report_stream_id
        AND report_sequence_no=p_report_sequence_no AND deployment_manifest_sha256=p_deployment_manifest_sha256
        AND receipt_artifact_id=p_receipt_artifact_id) THEN
      RETURN (SELECT rollback_receipt_id FROM callscore_plan_contract.provider_object_rollback_receipts WHERE operation_id=p_operation_id);
    END IF;
    RAISE EXCEPTION 'provider rollback stale replay rejected' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.provider_object_rollback_receipts
  VALUES(p_rollback_receipt_id,p_report_stream_id,p_report_sequence_no,p_deployment_manifest_sha256,p_workflow_id,
    p_operation_id,p_receipt_artifact_id,'PASS',p_verified_at,p_expires_at);
  RETURN p_rollback_receipt_id;
END;
$$;

CREATE FUNCTION record_runtime_variant_rollback_receipt(
  p_rollback_receipt_id uuid,p_report_stream_id text,p_report_sequence_no bigint,p_deployment_manifest_sha256 char(64),
  p_experiment_id uuid,p_trigger_measurement_id uuid,p_prior_variant_id uuid,p_restored_variant_id uuid,
  p_promotion_event_id uuid,p_rollback_event_id uuid,p_receipt_artifact_id uuid,p_verified_at timestamptz,p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, callscore_plan_contract AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.outcome_measurements
       WHERE measurement_id=p_trigger_measurement_id AND experiment_id=p_experiment_id AND variant_id=p_prior_variant_id)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_promotion_events
       WHERE promotion_event_id=p_promotion_event_id AND experiment_id=p_experiment_id AND decision='PROMOTE'
         AND candidate_variant_id=p_prior_variant_id)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_promotion_events
       WHERE promotion_event_id=p_rollback_event_id AND experiment_id=p_experiment_id AND decision='ROLLBACK'
         AND prior_champion_variant_id=p_prior_variant_id AND candidate_variant_id=p_restored_variant_id)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_receipt_artifact_id AND b.subject_kind='runtime_variant_rollback'
         AND b.subject_id=p_report_stream_id||':'||p_report_sequence_no::text
         AND b.subject_sha256=p_deployment_manifest_sha256 AND b.validation_schema='runtime-variant-rollback.v2') THEN
    RAISE EXCEPTION 'runtime rollback receipt exact report/experiment/measurement/events relation failed' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_variant_rollback_receipts WHERE trigger_measurement_id=p_trigger_measurement_id) THEN
    IF EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_variant_rollback_receipts
      WHERE trigger_measurement_id=p_trigger_measurement_id AND report_stream_id=p_report_stream_id
        AND report_sequence_no=p_report_sequence_no AND deployment_manifest_sha256=p_deployment_manifest_sha256
        AND prior_variant_id=p_prior_variant_id AND restored_variant_id=p_restored_variant_id
        AND receipt_artifact_id=p_receipt_artifact_id) THEN
      RETURN (SELECT rollback_receipt_id FROM callscore_plan_contract.runtime_variant_rollback_receipts WHERE trigger_measurement_id=p_trigger_measurement_id);
    END IF;
    RAISE EXCEPTION 'runtime rollback stale replay rejected' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.runtime_variant_rollback_receipts
  VALUES(p_rollback_receipt_id,p_report_stream_id,p_report_sequence_no,p_deployment_manifest_sha256,p_experiment_id,
    p_trigger_measurement_id,p_prior_variant_id,p_restored_variant_id,p_promotion_event_id,p_rollback_event_id,
    p_receipt_artifact_id,'PASS',p_verified_at,p_expires_at);
  RETURN p_rollback_receipt_id;
END;
$$;

CREATE FUNCTION insert_verified_autonomy_report(
  p_report_id uuid,
  p_report_stream_id text,
  p_sequence_no bigint,
  p_app_commit_sha char(40),
  p_workplane_commit_sha char(40),
  p_plan_commit_sha char(40),
  p_graph_source_sha256 char(64),
  p_migration_sha256 char(64),
  p_runtime_script_manifest_sha256 char(64),
  p_image_digest text,
  p_prompt_manifest_sha256 char(64),
  p_deployment_manifest_sha256 char(64),
  p_report_schema_sha256 char(64),
  p_evidence_schema_sha256 char(64),
  p_phase_manifest_index_sha256 char(64),
  p_review_attestation_ledger_sha256 char(64),
  p_verifier_script_sha256 char(64),
  p_frozen_evidence_manifest_sha256 char(64),
  p_report_json_artifact_id uuid,
  p_report_json_sha256 char(64),
  p_producer_agent_id text,
  p_verifier_agent_id text,
  p_verifier_artifact_id uuid,
  p_verifier_sha256 char(64),
  p_live_activation_approved boolean,
  p_blockers jsonb,
  p_canary_provider_operation_id uuid,
  p_canary_generation_id uuid,
  p_canary_accepted_evaluation_id uuid,
  p_final_review_execution_ids uuid[],
  p_canary_readback_artifact_id uuid,
  p_canary_provider_rollback_artifact_id uuid,
  p_runtime_variant_rollback_artifact_id uuid,
  p_provider_rollback_receipt_id uuid,
  p_runtime_rollback_receipt_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_operation callscore_plan_contract.provider_operations;
BEGIN
  IF p_producer_agent_id=p_verifier_agent_id OR NOT p_live_activation_approved OR jsonb_array_length(p_blockers)<>0 THEN
    RAISE EXCEPTION 'final PASS identity/activation/blocker predicate failed' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_operation FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_canary_provider_operation_id AND provider_state='VERIFIED'
     AND generation_id=p_canary_generation_id AND accepted_evaluation_id=p_canary_accepted_evaluation_id
     AND readback_receipt_artifact_id=p_canary_readback_artifact_id
     AND external_object_id IS NOT NULL;
  IF v_operation.operation_id IS NULL THEN
    RAISE EXCEPTION 'final PASS requires exact VERIFIED canary/readback relation' USING ERRCODE='23514';
  END IF;
  IF cardinality(p_final_review_execution_ids)<>3
     OR (SELECT count(DISTINCT x) FROM unnest(p_final_review_execution_ids) x)<>3
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_report_json_artifact_id AND content_sha256=p_report_json_sha256 AND artifact_kind='autonomy_implementation_report.v7')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_verifier_artifact_id AND content_sha256=p_verifier_sha256 AND artifact_kind='autonomy_report_verification_receipt.v3')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_canary_readback_artifact_id AND artifact_kind='provider_readback_receipt')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_canary_provider_rollback_artifact_id AND artifact_kind='provider_object_rollback_receipt.v2')
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_runtime_variant_rollback_artifact_id AND artifact_kind='runtime_variant_rollback_receipt.v2')
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_verifier_artifact_id AND b.subject_kind='autonomy_final_report'
         AND b.subject_id=p_report_id::text AND b.subject_sha256=p_report_json_sha256
         AND b.validation_schema='final-report-verification.v2' AND b.verifier_agent_id=p_verifier_agent_id
         AND b.verifier_context @> jsonb_build_object(
           'status','PASS','report_schema_sha256',p_report_schema_sha256,
           'evidence_schema_sha256',p_evidence_schema_sha256,
           'deployment_manifest_sha256',p_deployment_manifest_sha256,
           'phase_manifest_index_sha256',p_phase_manifest_index_sha256,
           'review_attestation_ledger_sha256',p_review_attestation_ledger_sha256,
           'verifier_script_sha256',p_verifier_script_sha256,
           'frozen_evidence_manifest_sha256',p_frozen_evidence_manifest_sha256,
           'canary_generation_id',p_canary_generation_id,
           'canary_accepted_evaluation_id',p_canary_accepted_evaluation_id,
           'final_review_execution_ids',to_jsonb(p_final_review_execution_ids)
         )
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_canary_readback_artifact_id AND b.subject_kind='provider_operation_evidence'
         AND b.subject_id=p_canary_provider_operation_id::text||':READBACK'
         AND b.validation_schema='provider-readback-evidence.v1'
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_canary_provider_rollback_artifact_id AND b.subject_kind='provider_object_rollback'
         AND b.subject_id=p_canary_provider_operation_id::text AND b.subject_sha256=p_deployment_manifest_sha256
         AND b.validation_schema='provider-object-rollback.v2'
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_runtime_variant_rollback_artifact_id AND b.subject_kind='runtime_variant_rollback'
         AND b.subject_id=p_report_stream_id||':'||p_sequence_no::text AND b.subject_sha256=p_deployment_manifest_sha256
         AND b.validation_schema='runtime-variant-rollback.v2'
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.subject_kind='activation_fence' AND b.subject_sha256=p_deployment_manifest_sha256
         AND b.validation_schema='activation-approval.v2'
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.autonomy_activation_fence f
       WHERE f.singleton=true AND f.fenced=false
         AND f.active_deployment_subject_sha256=p_deployment_manifest_sha256
         AND f.activation_approval_artifact_id IS NOT NULL
     )
     OR (SELECT count(*) FROM callscore_plan_contract.autonomy_review_receipts r
         JOIN callscore_plan_contract.review_execution_attestations a USING(review_execution_id)
         WHERE r.review_execution_id=ANY(p_final_review_execution_ids)
           AND r.phase='FINAL' AND r.status='PASS' AND r.reviewed_subject_sha256=p_deployment_manifest_sha256
           AND a.target_app_commit_sha=p_app_commit_sha AND a.target_plan_commit_sha=p_plan_commit_sha
           AND a.target_deployment_manifest_sha256=p_deployment_manifest_sha256)<>3
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.provider_object_rollback_receipts r
         WHERE r.rollback_receipt_id=p_provider_rollback_receipt_id AND r.report_stream_id=p_report_stream_id
           AND r.report_sequence_no=p_sequence_no AND r.deployment_manifest_sha256=p_deployment_manifest_sha256
           AND r.operation_id=p_canary_provider_operation_id AND r.receipt_artifact_id=p_canary_provider_rollback_artifact_id
           AND r.status='PASS' AND r.expires_at>clock_timestamp())
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_variant_rollback_receipts r
         WHERE r.rollback_receipt_id=p_runtime_rollback_receipt_id AND r.report_stream_id=p_report_stream_id
           AND r.report_sequence_no=p_sequence_no AND r.deployment_manifest_sha256=p_deployment_manifest_sha256
           AND r.receipt_artifact_id=p_runtime_variant_rollback_artifact_id
           AND r.status='PASS' AND r.expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'final PASS artifact relation/hash failed' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.autonomy_final_reports(
    report_id,report_stream_id,sequence_no,report_schema,app_commit_sha,workplane_commit_sha,plan_commit_sha,
    graph_source_sha256,migration_sha256,runtime_script_manifest_sha256,image_digest,prompt_manifest_sha256,
    deployment_manifest_sha256,report_json_artifact_id,report_json_sha256,producer_agent_id,
    verifier_agent_id,verifier_artifact_id,verifier_sha256,verifier_status,final_status,
    live_activation_approved,blockers,canary_status,canary_provider_operation_id,
    canary_readback_artifact_id,canary_provider_rollback_artifact_id,runtime_variant_rollback_artifact_id
    ,provider_rollback_receipt_id,runtime_rollback_receipt_id
  ) VALUES (
    p_report_id,p_report_stream_id,p_sequence_no,'callscore.autonomy_implementation_report.v7',
    p_app_commit_sha,p_workplane_commit_sha,p_plan_commit_sha,p_graph_source_sha256,p_migration_sha256,
    p_runtime_script_manifest_sha256,p_image_digest,p_prompt_manifest_sha256,p_deployment_manifest_sha256,p_report_json_artifact_id,
    p_report_json_sha256,p_producer_agent_id,p_verifier_agent_id,p_verifier_artifact_id,
    p_verifier_sha256,'PASS','PASS',true,p_blockers,'PASS',p_canary_provider_operation_id,
    p_canary_readback_artifact_id,p_canary_provider_rollback_artifact_id,p_runtime_variant_rollback_artifact_id,
    p_provider_rollback_receipt_id,p_runtime_rollback_receipt_id
  );
  RETURN p_report_id;
END;
$$;

CREATE FUNCTION record_outcome_measurement(
  p_measurement_id uuid,
  p_workflow_id uuid,
  p_generation_id uuid,
  p_operation_id uuid,
  p_metric_name text,
  p_numerator numeric,
  p_denominator numeric,
  p_window_started_at timestamptz,
  p_window_ended_at timestamptz,
  p_source_artifact_id uuid,
  p_source_sha256 char(64),
  p_attribution_contract jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_g callscore_plan_contract.generation_provenance;
        v_o callscore_plan_contract.provider_operations; v_seq bigint;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  IF p_denominator<=0 OR p_window_ended_at<p_window_started_at THEN RAISE EXCEPTION 'invalid outcome denominator/window' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_g FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  IF v_w.workflow_state<>'OUTCOME_PENDING' OR v_g.generation_id IS NULL THEN RAISE EXCEPTION 'outcome lineage/state invalid' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_source_artifact_id AND content_sha256=p_source_sha256) THEN
    RAISE EXCEPTION 'outcome source artifact hash mismatch' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
    WHERE b.evidence_artifact_id=p_source_artifact_id AND b.subject_kind='outcome_measurement'
      AND b.subject_id=p_workflow_id::text||':'||p_metric_name AND b.subject_sha256=p_source_sha256
      AND b.validation_schema='outcome-source.v1' AND b.validation_status='PASS'
  ) THEN RAISE EXCEPTION 'outcome source lacks independent exact-subject validation' USING ERRCODE='23514'; END IF;
  IF v_w.execution_class='OWNED_PUBLIC_MUTATION' THEN
    SELECT * INTO v_o FROM callscore_plan_contract.provider_operations
     WHERE operation_id=p_operation_id AND workflow_id=p_workflow_id AND generation_id=p_generation_id
       AND provider_state='VERIFIED' AND EXISTS(
         SELECT 1 FROM callscore_plan_contract.quality_evaluations q
         WHERE q.evaluation_id=provider_operations.accepted_evaluation_id
           AND q.generation_id=p_generation_id AND q.decision='ACCEPT'
       );
    IF v_o.operation_id IS NULL THEN RAISE EXCEPTION 'published outcome requires exact VERIFIED provider operation' USING ERRCODE='23514'; END IF;
  ELSIF p_operation_id IS NOT NULL THEN
    RAISE EXCEPTION 'non-mutating outcome forbids provider operation' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.outcome_measurements WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.outcome_measurements(
    measurement_id,workflow_id,sequence_no,generation_id,operation_id,publication_id,
    experiment_id,cohort_id,variant_id,channel,metric_name,numerator,denominator,metric_value,
    window_started_at,window_ended_at,source_artifact_id,source_sha256,attribution_contract
  ) VALUES (
    p_measurement_id,p_workflow_id,v_seq,p_generation_id,p_operation_id,v_o.external_object_id,
    v_g.experiment_id,v_g.cohort_id,v_g.variant_id,v_w.channel,p_metric_name,p_numerator,p_denominator,
    p_numerator/p_denominator,p_window_started_at,p_window_ended_at,p_source_artifact_id,p_source_sha256,p_attribution_contract
  );
  RETURN p_measurement_id;
END;
$$;

CREATE FUNCTION record_canonical_learning_set(
  p_workflow_id uuid,
  p_measurement_id uuid,
  p_generation_id uuid,
  p_learning_artifact_ids uuid[],
  p_payloads jsonb[],
  p_validation_artifact_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_m callscore_plan_contract.outcome_measurements; v_g callscore_plan_contract.generation_provenance;
        v_q callscore_plan_contract.quality_evaluations; v_expected text[]:=ARRAY['learning_event.v1','agent_performance_ledger.v1','learning_delta.v1','experiment_result.v1'];
        v_i integer; v_payload jsonb; v_payload_sha text;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  IF cardinality(p_learning_artifact_ids)<>4 OR cardinality(p_payloads)<>4 OR cardinality(p_validation_artifact_ids)<>4 THEN
    RAISE EXCEPTION 'learning set must contain exactly four artifacts' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_m FROM callscore_plan_contract.outcome_measurements WHERE measurement_id=p_measurement_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_g FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_q FROM callscore_plan_contract.quality_evaluations WHERE workflow_id=p_workflow_id AND generation_id=p_generation_id AND decision='ACCEPT' ORDER BY sequence_no DESC LIMIT 1;
  IF v_m.measurement_id IS NULL OR v_g.generation_id IS NULL OR v_q.evaluation_id IS NULL THEN
    RAISE EXCEPTION 'learning lineage requires measurement, producer generation, and accepted evaluation' USING ERRCODE='23514';
  END IF;
  FOR v_i IN 1..4 LOOP
    v_payload:=p_payloads[v_i];
    v_payload_sha:=encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
    IF v_payload->>'schema' IS DISTINCT FROM v_expected[v_i]
       OR v_payload->>'workflow_id' IS DISTINCT FROM p_workflow_id::text
       OR v_payload->>'measurement_id' IS DISTINCT FROM p_measurement_id::text
       OR v_payload->>'generation_id' IS DISTINCT FROM p_generation_id::text
       OR v_payload->>'agent_id' IS DISTINCT FROM v_g.producer_agent_id
       OR v_payload->>'channel' IS DISTINCT FROM v_g.channel
       OR v_payload->>'prompt_name' IS DISTINCT FROM v_g.prompt_name
       OR v_payload->>'prompt_version' IS DISTINCT FROM v_g.prompt_version
       OR v_payload->>'prompt_sha256' IS DISTINCT FROM v_g.prompt_sha256::text
       OR v_payload->>'model' IS DISTINCT FROM v_g.model
       OR v_payload->>'provider' IS DISTINCT FROM v_g.provider
       OR v_payload->'parameters' IS DISTINCT FROM v_g.parameters
       OR v_payload->>'experiment_id' IS DISTINCT FROM v_g.experiment_id::text
       OR v_payload->>'cohort_id' IS DISTINCT FROM v_g.cohort_id::text
       OR v_payload->>'variant_id' IS DISTINCT FROM v_g.variant_id::text
       OR v_payload->>'publication_id' IS DISTINCT FROM v_m.publication_id
       OR v_payload->>'source_artifact_id' IS DISTINCT FROM v_m.source_artifact_id::text
       OR v_payload->>'source_sha256' IS DISTINCT FROM v_m.source_sha256::text
       OR (v_payload->>'registry_version')::bigint IS DISTINCT FROM v_g.registry_version
       OR (v_payload->>'evaluator_weighted_score')::numeric IS DISTINCT FROM v_q.weighted_score
       OR NOT (v_payload ? 'recorded_at')
       OR (v_expected[v_i]='learning_event.v1' AND NOT (v_payload ?& ARRAY['event_type','metric_name','metric_value','attribution_contract']))
       OR (v_expected[v_i]='agent_performance_ledger.v1' AND NOT (v_payload ?& ARRAY['period_started_at','period_duration_seconds','task_counts','quality_metrics','outcome_metrics','safety_violations']))
       OR (v_expected[v_i]='learning_delta.v1' AND NOT (v_payload ?& ARRAY['prior_variant_id','candidate_variant_id','changes','evidence_artifact_ids','hypothesis','predicted_effect','risk_class']))
       OR (v_expected[v_i]='experiment_result.v1' AND NOT (v_payload ?& ARRAY['variant_ids','control_sample_size','treatment_sample_size','observation_days','primary_metric','absolute_delta','relative_delta','bootstrap_ci95','safety_violations','decision']))
       OR NOT EXISTS(
         SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
         WHERE artifact_id=p_learning_artifact_ids[v_i] AND artifact_kind=v_expected[v_i] AND content_sha256=v_payload_sha
       )
       OR NOT EXISTS(
         SELECT 1
         FROM callscore_plan_contract.verified_evidence_bindings b
         JOIN callscore_plan_contract.autonomy_artifacts a ON a.artifact_id=b.evidence_artifact_id
         WHERE b.evidence_artifact_id=p_validation_artifact_ids[v_i]
           AND a.artifact_kind='json_schema_validation_receipt'
           AND b.subject_kind='canonical_learning_payload'
           AND b.subject_id=v_expected[v_i]||':'||p_learning_artifact_ids[v_i]::text
           AND b.subject_sha256=v_payload_sha
           AND b.validation_schema='canonical-learning-artifacts.v4'
           AND b.validation_status='PASS'
       ) THEN RAISE EXCEPTION 'learning schema/provenance/validation receipt mismatch at index %',v_i USING ERRCODE='23514';
    END IF;
    INSERT INTO callscore_plan_contract.canonical_learning_artifacts(
      learning_artifact_id,workflow_id,sequence_no,measurement_id,generation_id,experiment_id,cohort_id,variant_id,
      agent_id,channel,prompt_name,prompt_version,model,provider,parameters,evaluator_weighted_score,
      artifact_schema,artifact_payload,artifact_payload_sha256,schema_validation_artifact_id
    ) VALUES (
      p_learning_artifact_ids[v_i],p_workflow_id,v_i,p_measurement_id,p_generation_id,v_g.experiment_id,v_g.cohort_id,v_g.variant_id,
      v_g.producer_agent_id,v_g.channel,v_g.prompt_name,v_g.prompt_version,v_g.model,v_g.provider,v_g.parameters,v_q.weighted_score,
      v_expected[v_i],v_payload,v_payload_sha,p_validation_artifact_ids[v_i]
    );
  END LOOP;
  RETURN 4;
END;
$$;

CREATE FUNCTION reclaim_provider_claim(
  p_operation_id uuid,
  p_expected_version bigint,
  p_worker_id text,
  p_lease_token uuid
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_prior text; v_row callscore_plan_contract.provider_operations;
BEGIN
  SELECT lease_owner INTO v_prior FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_operation_id AND provider_state='CLAIMED' AND state_version=p_expected_version
     AND lease_expires_at<clock_timestamp()
     AND EXISTS(
       SELECT 1 FROM callscore_plan_contract.external_action_grants g
       WHERE g.grant_id=provider_operations.authority_grant_id
         AND g.expires_at>clock_timestamp()
         AND NOT EXISTS(SELECT 1 FROM callscore_plan_contract.external_action_grant_revocations r WHERE r.grant_id=g.grant_id)
     ) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale pre-dispatch claim not reclaimable' USING ERRCODE='40001'; END IF;
  UPDATE callscore_plan_contract.provider_operations
  SET lease_owner=p_worker_id,lease_token=p_lease_token,lease_generation=lease_generation+1,
      lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id
  RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.provider_operation_lease_events(
    lease_event_id,operation_id,sequence_no,lease_generation,prior_lease_owner,lease_owner,
    lease_token,lease_expires_at,controlled_reason_code
  ) VALUES (gen_random_uuid(),p_operation_id,v_row.lease_generation,v_row.lease_generation,v_prior,p_worker_id,
    p_lease_token,v_row.lease_expires_at,'safe_reclaim_before_dispatch_boundary');
  RETURN v_row;
END;
$$;

CREATE FUNCTION compute_runtime_experiment_statistics(p_experiment_id uuid)
RETURNS TABLE(
  control_sample_size integer,
  treatment_sample_size integer,
  observation_days integer,
  quality_delta numeric,
  outcome_relative_delta numeric,
  bootstrap_ci_lower numeric,
  safety_violations integer,
  provider_verification_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
WITH experiment AS (
  SELECT * FROM callscore_plan_contract.runtime_experiments WHERE experiment_id=p_experiment_id
), latest_quality AS (
  SELECT DISTINCT ON (q.workflow_id,q.generation_id) q.workflow_id,q.generation_id,q.evaluation_id,q.weighted_score
  FROM callscore_plan_contract.quality_evaluations q
  WHERE q.decision='ACCEPT' ORDER BY q.workflow_id,q.generation_id,q.sequence_no DESC
), latest_measurements AS (
  SELECT DISTINCT ON (m.workflow_id) m.*,w.execution_class AS workflow_execution_class
  FROM callscore_plan_contract.outcome_measurements m
  JOIN experiment e ON e.experiment_id=m.experiment_id AND e.primary_metric=m.metric_name
  JOIN callscore_plan_contract.generation_provenance g
    ON g.generation_id=m.generation_id AND g.workflow_id=m.workflow_id AND g.experiment_id=m.experiment_id
      AND g.cohort_id=m.cohort_id AND g.variant_id=m.variant_id
  JOIN callscore_plan_contract.runtime_variant_assignments a
    ON a.workflow_id=m.workflow_id AND a.producer_agent_id=g.producer_agent_id AND a.delegated_role=g.delegated_role
      AND a.experiment_id=m.experiment_id AND a.cohort_id=m.cohort_id AND a.variant_id=m.variant_id
  JOIN callscore_plan_contract.autonomy_workflows w ON w.workflow_id=m.workflow_id AND w.workflow_state='COMPLETE'
  WHERE e.eligibility_contract=jsonb_build_object('require_terminal_complete',true,'require_outcome',true,'require_accepted_quality',true)
  ORDER BY m.workflow_id,m.window_ended_at DESC,m.sequence_no DESC
), observations AS (
  SELECT m.workflow_id,c.cohort_name,m.metric_value,q.weighted_score,m.window_ended_at,m.workflow_execution_class,
         (m.workflow_execution_class<>'OWNED_PUBLIC_MUTATION' OR EXISTS(
           SELECT 1 FROM callscore_plan_contract.provider_operations p
           WHERE p.operation_id=m.operation_id AND p.workflow_id=m.workflow_id
             AND p.generation_id=m.generation_id AND p.accepted_evaluation_id=q.evaluation_id
             AND p.provider_state='VERIFIED'
         )) AS has_verified_operation
  FROM latest_measurements m
  JOIN callscore_plan_contract.runtime_cohorts c
    ON c.experiment_id=m.experiment_id AND c.cohort_id=m.cohort_id AND c.variant_id=m.variant_id
  JOIN latest_quality q ON q.workflow_id=m.workflow_id AND q.generation_id=m.generation_id
  WHERE m.workflow_execution_class<>'OWNED_PUBLIC_MUTATION' OR EXISTS(
    SELECT 1 FROM callscore_plan_contract.provider_operations p
    WHERE p.operation_id=m.operation_id AND p.workflow_id=m.workflow_id
      AND p.generation_id=m.generation_id AND p.accepted_evaluation_id=q.evaluation_id
      AND p.provider_state='VERIFIED'
  )
), arrays AS (
  SELECT
    array_agg(metric_value ORDER BY workflow_id) FILTER (WHERE cohort_name='CONTROL') AS c_values,
    array_agg(metric_value ORDER BY workflow_id) FILTER (WHERE cohort_name='TREATMENT') AS t_values,
    avg(weighted_score) FILTER (WHERE cohort_name='CONTROL') AS c_quality,
    avg(weighted_score) FILTER (WHERE cohort_name='TREATMENT') AS t_quality,
    min(window_ended_at) AS first_at,max(window_ended_at) AS last_at
  FROM observations
), bootstrap AS (
  SELECT rep,
    (SELECT avg(a.c_values[1+((hashtextextended(p_experiment_id::text||':'||rep||':c:'||i,e.bootstrap_seed) & 9223372036854775807) % cardinality(a.c_values))::integer]) FROM generate_series(1,cardinality(a.c_values)) i) AS c_mean,
    (SELECT avg(a.t_values[1+((hashtextextended(p_experiment_id::text||':'||rep||':t:'||i,e.bootstrap_seed) & 9223372036854775807) % cardinality(a.t_values))::integer]) FROM generate_series(1,cardinality(a.t_values)) i) AS t_mean
  FROM arrays a CROSS JOIN experiment e CROSS JOIN LATERAL generate_series(1,e.bootstrap_resamples) rep
  WHERE cardinality(a.c_values)>0 AND cardinality(a.t_values)>0
), bootstrap_delta AS (
  SELECT (t_mean-c_mean)/NULLIF(abs(c_mean),0) AS delta FROM bootstrap
), provider_rate AS (
  SELECT CASE WHEN count(*) FILTER (WHERE workflow_execution_class='OWNED_PUBLIC_MUTATION')=0 THEN 1::numeric
              ELSE count(*) FILTER (WHERE workflow_execution_class='OWNED_PUBLIC_MUTATION' AND has_verified_operation)::numeric
                   / count(*) FILTER (WHERE workflow_execution_class='OWNED_PUBLIC_MUTATION') END AS rate
  FROM observations
), safety AS (
  SELECT count(*)::integer AS violations
  FROM callscore_plan_contract.canonical_learning_artifacts l
  WHERE l.experiment_id=p_experiment_id AND l.artifact_schema='learning_event.v1'
    AND l.artifact_payload->>'event_type' IN ('safety_violation','policy_violation','canonical_receipt_violation','public_deletion_violation','restricted_lane_violation')
    AND COALESCE((l.artifact_payload->>'metric_value')::numeric,0)>0
)
SELECT cardinality(a.c_values),cardinality(a.t_values),
       floor(extract(epoch FROM (a.last_at-a.first_at))/86400)::integer,
       a.t_quality-a.c_quality,
       ((SELECT avg(x) FROM unnest(a.t_values) x)-(SELECT avg(x) FROM unnest(a.c_values) x))
         / NULLIF(abs((SELECT avg(x) FROM unnest(a.c_values) x)),0),
       percentile_cont(0.025) WITHIN GROUP (ORDER BY b.delta),s.violations,p.rate
FROM arrays a CROSS JOIN provider_rate p CROSS JOIN safety s LEFT JOIN bootstrap_delta b ON true
GROUP BY a.c_values,a.t_values,a.first_at,a.last_at,a.c_quality,a.t_quality,s.violations,p.rate;
$$;

CREATE FUNCTION import_runtime_experiment_bundle(
  p_bundle jsonb,p_review_receipt_artifact_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_experiment_id uuid:=(p_bundle->>'experiment_id')::uuid;
        v_control uuid:=(p_bundle#>>'{control,variant_id}')::uuid;
        v_treatment uuid:=(p_bundle#>>'{treatment,variant_id}')::uuid;
        v_agent text:=p_bundle->>'agent_id'; v_channel text:=p_bundle->>'channel';
        v_task text:=p_bundle->>'task_type'; v_policy text:=p_bundle->>'policy_version';
        v_review callscore_plan_contract.autonomy_artifacts; v_existing callscore_plan_contract.runtime_experiments;
        v_registry callscore_plan_contract.runtime_registry; v_control_parent uuid:=NULLIF(p_bundle#>>'{control,created_from_variant_id}','')::uuid;
        v_bundle_sha256 char(64):=encode(sha256(convert_to(p_bundle::text,'UTF8')),'hex');
BEGIN
  SELECT * INTO v_review FROM callscore_plan_contract.autonomy_artifacts
   WHERE artifact_id=p_review_receipt_artifact_id AND artifact_kind='runtime_experiment_bundle_review_receipt';
  IF v_review.artifact_id IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_review_receipt_artifact_id
         AND b.subject_kind='runtime_experiment_bundle' AND b.subject_id=v_experiment_id::text
         AND b.subject_sha256=v_bundle_sha256 AND b.validation_schema='runtime-experiment-bundle-review.v1'
         AND b.validation_status='PASS'
     )
     OR p_bundle->>'schema'<>'callscore.runtime_experiment_bundle.v1'
     OR p_bundle->'eligibility_contract'<>jsonb_build_object('require_terminal_complete',true,'require_outcome',true,'require_accepted_quality',true)
     OR (p_bundle->>'bootstrap_resamples')::integer<>10000 OR (p_bundle->>'minimum_control')::integer<>30
     OR (p_bundle->>'minimum_treatment')::integer<>30 OR (p_bundle->>'minimum_observation_days')::integer<>14
     OR (p_bundle->>'treatment_ratio')::integer<>20
     OR p_bundle->'bootstrap_contract'<>jsonb_build_object('method','percentile_bootstrap','statistic','relative_mean_delta','missing_data','exclude')
     OR v_control=v_treatment
     OR (p_bundle#>>'{control,cohort_id}')::uuid=(p_bundle#>>'{treatment,cohort_id}')::uuid
     OR NULLIF(p_bundle#>>'{treatment,created_from_variant_id}','')::uuid IS DISTINCT FROM v_control THEN
    RAISE EXCEPTION 'reviewed experiment bundle schema/constants invalid' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_agent||':'||v_channel||':'||v_task||':'||v_policy,0));
  SELECT * INTO v_existing FROM callscore_plan_contract.runtime_experiments
   WHERE experiment_id=v_experiment_id FOR UPDATE;
  IF v_existing.experiment_id IS NOT NULL THEN
    IF v_existing.bundle_sha256<>v_bundle_sha256
       OR v_existing.review_receipt_artifact_id<>p_review_receipt_artifact_id THEN
      RAISE EXCEPTION 'experiment id already binds different reviewed bundle' USING ERRCODE='23514';
    END IF;
    RETURN v_existing.experiment_id;
  END IF;
  SELECT * INTO v_registry FROM callscore_plan_contract.runtime_registry
   WHERE agent_id=v_agent AND channel=v_channel AND task_type=v_task AND policy_version=v_policy FOR UPDATE;
  IF (v_registry.active_variant_id IS NULL AND v_control_parent IS NOT NULL)
     OR (v_registry.active_variant_id IS NOT NULL AND v_control_parent IS DISTINCT FROM v_registry.active_variant_id)
     OR EXISTS(
       SELECT 1 FROM callscore_plan_contract.runtime_experiments e
       WHERE e.agent_id=v_agent AND e.channel=v_channel AND e.task_type=v_task AND e.policy_version=v_policy
         AND e.experiment_id<>v_experiment_id AND e.starts_at<=clock_timestamp()
         AND (e.ends_at IS NULL OR e.ends_at>clock_timestamp())
     ) THEN RAISE EXCEPTION 'experiment control lineage or overlap invalid' USING ERRCODE='23514'; END IF;
  INSERT INTO callscore_plan_contract.runtime_experiments(
    experiment_id,agent_id,channel,task_type,policy_version,primary_metric,eligibility_contract,bootstrap_contract,
    bootstrap_resamples,bootstrap_seed,minimum_control,minimum_treatment,minimum_observation_days,
    minimum_outcome_relative_delta,minimum_quality_delta,minimum_ci_lower_bound,minimum_provider_verification_rate,
    maximum_safety_violations,treatment_ratio,bundle_sha256,review_receipt_artifact_id,starts_at
  ) VALUES(v_experiment_id,v_agent,v_channel,v_task,v_policy,p_bundle->>'primary_metric',p_bundle->'eligibility_contract',
    p_bundle->'bootstrap_contract',10000,(p_bundle->>'bootstrap_seed')::bigint,30,30,14,0.10,0.03,0,1,0,20,
    v_bundle_sha256,p_review_receipt_artifact_id,(p_bundle->>'starts_at')::timestamptz);
  INSERT INTO callscore_plan_contract.runtime_variants(
    variant_id,experiment_id,agent_id,channel,task_type,policy_version,prompt_name,prompt_version,prompt_sha256,
    model,provider,parameters,tools_manifest_sha256,skills_manifest_sha256,created_from_variant_id,definition_sha256
  ) SELECT (x->>'variant_id')::uuid,v_experiment_id,v_agent,v_channel,v_task,v_policy,x->>'prompt_name',x->>'prompt_version',
    x->>'prompt_sha256',x->>'model',x->>'provider',x->'parameters',x->>'tools_manifest_sha256',x->>'skills_manifest_sha256',
    NULLIF(x->>'created_from_variant_id','')::uuid,encode(sha256(convert_to((x-'definition_sha256')::text,'UTF8')),'hex')
    FROM (VALUES(p_bundle->'control'),(p_bundle->'treatment')) AS variants(x);
  INSERT INTO callscore_plan_contract.runtime_cohorts(cohort_id,experiment_id,cohort_name,variant_id) VALUES
    ((p_bundle#>>'{control,cohort_id}')::uuid,v_experiment_id,'CONTROL',v_control),
    ((p_bundle#>>'{treatment,cohort_id}')::uuid,v_experiment_id,'TREATMENT',v_treatment);
  INSERT INTO callscore_plan_contract.runtime_registry(agent_id,channel,task_type,policy_version,active_variant_id,registry_version)
   VALUES(v_agent,v_channel,v_task,v_policy,v_control,1)
   ON CONFLICT(agent_id,channel,task_type,policy_version) DO UPDATE
     SET active_variant_id=EXCLUDED.active_variant_id,rollback_variant_id=NULL,
         registry_version=callscore_plan_contract.runtime_registry.registry_version+1,updated_at=clock_timestamp();
  RETURN v_experiment_id;
END;
$$;

CREATE FUNCTION conclude_runtime_experiment(
  p_experiment_id uuid,p_expected_bundle_sha256 char(64),p_conclusion_artifact_id uuid,p_controlled_reason_code text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_experiment callscore_plan_contract.runtime_experiments;
BEGIN
  SELECT * INTO v_experiment FROM callscore_plan_contract.runtime_experiments
   WHERE experiment_id=p_experiment_id AND bundle_sha256=p_expected_bundle_sha256 AND ends_at IS NULL FOR UPDATE;
  IF v_experiment.experiment_id IS NULL OR p_controlled_reason_code IS NULL OR p_controlled_reason_code=''
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
       WHERE b.evidence_artifact_id=p_conclusion_artifact_id AND b.subject_kind='runtime_experiment_conclusion'
         AND b.subject_id=p_experiment_id::text AND b.subject_sha256=p_expected_bundle_sha256
         AND b.validation_schema='runtime-experiment-conclusion.v1' AND b.validation_status='PASS'
     ) THEN RAISE EXCEPTION 'experiment conclusion exact evidence predicate failed' USING ERRCODE='23514'; END IF;
  UPDATE callscore_plan_contract.runtime_experiments SET ends_at=clock_timestamp()
   WHERE experiment_id=p_experiment_id AND ends_at IS NULL;
  RETURN p_experiment_id;
END;
$$;

CREATE FUNCTION assign_runtime_variant(p_workflow_id uuid,p_producer_agent_id text,p_delegated_role text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_e callscore_plan_contract.runtime_experiments;
        v_r callscore_plan_contract.runtime_registry; v_cohort callscore_plan_contract.runtime_cohorts;
        v_bucket integer; v_assignment uuid:=gen_random_uuid(); v_hash bytea; v_monitor_experiment uuid; v_monitor_event uuid; v_sequence bigint;
BEGIN
  PERFORM callscore_plan_contract.assert_current_live_workflow_lease(p_workflow_id);
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_w.workflow_state NOT IN ('HEAD_PLANNING','CHILDREN_RUNNING','QUALITY_EVALUATION')
     OR NOT (
       (p_delegated_role='head-synthesizer' AND p_producer_agent_id=v_w.head_agent_id AND v_w.workflow_state='HEAD_PLANNING')
       OR EXISTS(
         SELECT 1 FROM callscore_plan_contract.agent_delegations d
         JOIN callscore_plan_contract.workflow_specialist_requirements r USING(requirement_id)
         WHERE d.workflow_id=p_workflow_id AND d.revision_number=v_w.revision_count
           AND d.canonical_child_agent_id=p_producer_agent_id AND d.delegated_role=p_delegated_role
           AND d.launch_status='DISPATCH_INTENT'
           AND ((v_w.workflow_state='CHILDREN_RUNNING' AND r.requirement_stage='SYNTHESIS_INPUT')
             OR (v_w.workflow_state='QUALITY_EVALUATION' AND r.requirement_stage='POST_SYNTHESIS_EVALUATOR'))
       )
     ) THEN RAISE EXCEPTION 'producer assignment task/role/state binding failed' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_e FROM callscore_plan_contract.runtime_experiments
   WHERE agent_id=p_producer_agent_id AND channel=v_w.channel AND task_type=v_w.task_type AND policy_version=v_w.policy_version
     AND starts_at<=clock_timestamp() AND (ends_at IS NULL OR ends_at>clock_timestamp())
   ORDER BY starts_at DESC LIMIT 1;
  SELECT * INTO v_r FROM callscore_plan_contract.runtime_registry
   WHERE agent_id=p_producer_agent_id AND channel=v_w.channel AND task_type=v_w.task_type AND policy_version=v_w.policy_version;
  IF v_r.active_variant_id IS NULL THEN RAISE EXCEPTION 'no exact active registry' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_sequence
  FROM callscore_plan_contract.runtime_variant_assignments WHERE workflow_id=p_workflow_id;
  IF v_e.experiment_id IS NULL THEN
    IF v_r.rollback_variant_id IS NOT NULL THEN
      SELECT p.experiment_id,p.promotion_event_id INTO v_monitor_experiment,v_monitor_event FROM callscore_plan_contract.runtime_promotion_events p
       WHERE p.candidate_variant_id=v_r.active_variant_id AND p.decision='PROMOTE' ORDER BY p.created_at DESC LIMIT 1;
      SELECT * INTO v_cohort FROM callscore_plan_contract.runtime_cohorts
       WHERE experiment_id=v_monitor_experiment AND cohort_name='TREATMENT' AND variant_id=v_r.active_variant_id;
      IF v_cohort.cohort_id IS NULL THEN RAISE EXCEPTION 'post-promotion monitoring cohort missing' USING ERRCODE='23514'; END IF;
      INSERT INTO callscore_plan_contract.runtime_variant_assignments(
        assignment_id,workflow_id,producer_agent_id,delegated_role,experiment_id,sequence_no,cohort_id,cohort_name,variant_id,
        assignment_bucket,assignment_ratio_control,monitoring_promotion_event_id,registry_version
      ) VALUES(v_assignment,p_workflow_id,p_producer_agent_id,p_delegated_role,v_monitor_experiment,v_sequence,v_cohort.cohort_id,'TREATMENT',v_r.active_variant_id,99,80,v_monitor_event,v_r.registry_version);
      RETURN v_assignment;
    END IF;
    INSERT INTO callscore_plan_contract.runtime_variant_assignments(
      assignment_id,workflow_id,producer_agent_id,delegated_role,sequence_no,variant_id,registry_version
    ) VALUES (v_assignment,p_workflow_id,p_producer_agent_id,p_delegated_role,v_sequence,v_r.active_variant_id,v_r.registry_version);
    RETURN v_assignment;
  END IF;
  v_hash:=sha256(convert_to(jsonb_build_object('experiment_id',v_e.experiment_id,'workflow_id',p_workflow_id,'producer_agent_id',p_producer_agent_id,'delegated_role',p_delegated_role)::text,'UTF8'));
  v_bucket:=((('x'||substr(encode(v_hash,'hex'),1,16))::bit(64)::bigint & 9223372036854775807) % 100)::integer;
  SELECT * INTO v_cohort FROM callscore_plan_contract.runtime_cohorts
   WHERE experiment_id=v_e.experiment_id AND cohort_name=CASE WHEN v_bucket<80 THEN 'CONTROL' ELSE 'TREATMENT' END;
  IF v_cohort.cohort_id IS NULL OR (v_bucket<80 AND v_cohort.variant_id<>v_r.active_variant_id) THEN
    RAISE EXCEPTION 'cohort/registry variant mismatch' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.runtime_variant_assignments(
    assignment_id,workflow_id,producer_agent_id,delegated_role,experiment_id,sequence_no,cohort_id,cohort_name,variant_id,
    assignment_bucket,assignment_ratio_control,registry_version
  ) VALUES (v_assignment,p_workflow_id,p_producer_agent_id,p_delegated_role,v_e.experiment_id,v_sequence,v_cohort.cohort_id,v_cohort.cohort_name,
    v_cohort.variant_id,v_bucket,80,v_r.registry_version);
  RETURN v_assignment;
END;
$$;

CREATE FUNCTION promote_runtime_variant(
  p_experiment_id uuid,
  p_expected_registry_version bigint,
  p_evaluator_generation_id uuid,
  p_trust_generation_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_e callscore_plan_contract.runtime_experiments; v_r callscore_plan_contract.runtime_registry;
        v_control uuid; v_candidate uuid; v_eval callscore_plan_contract.generation_provenance; v_trust callscore_plan_contract.generation_provenance;
        v_stats record; v_event uuid:=gen_random_uuid(); v_seq bigint;
BEGIN
  SELECT * INTO v_e FROM callscore_plan_contract.runtime_experiments WHERE experiment_id=p_experiment_id;
  SELECT c.variant_id INTO v_control FROM callscore_plan_contract.runtime_cohorts c WHERE c.experiment_id=p_experiment_id AND c.cohort_name='CONTROL';
  SELECT c.variant_id INTO v_candidate FROM callscore_plan_contract.runtime_cohorts c WHERE c.experiment_id=p_experiment_id AND c.cohort_name='TREATMENT';
  SELECT * INTO v_r FROM callscore_plan_contract.runtime_registry WHERE agent_id=v_e.agent_id AND channel=v_e.channel AND task_type=v_e.task_type AND policy_version=v_e.policy_version FOR UPDATE;
  SELECT * INTO v_eval FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_evaluator_generation_id AND delegated_role='evaluator';
  SELECT * INTO v_trust FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_trust_generation_id AND delegated_role='trust-reviewer';
  IF v_e.experiment_id IS NULL OR v_r.registry_version<>p_expected_registry_version OR v_r.active_variant_id<>v_control
     OR v_eval.generation_id IS NULL OR v_trust.generation_id IS NULL
     OR v_eval.producer_agent_id=v_trust.producer_agent_id OR v_eval.hermes_session_id IS NOT DISTINCT FROM v_trust.hermes_session_id
     OR p_evaluator_generation_id=p_trust_generation_id
     OR EXISTS(SELECT 1 FROM callscore_plan_contract.generation_provenance g WHERE g.variant_id=v_candidate AND g.delegated_role='candidate-producer' AND g.producer_agent_id IN (v_eval.producer_agent_id,v_trust.producer_agent_id))
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.quality_evaluations q
       JOIN callscore_plan_contract.generation_provenance candidate ON candidate.generation_id=q.generation_id
       WHERE q.evaluator_generation_id=p_evaluator_generation_id AND q.decision='ACCEPT' AND candidate.variant_id=v_candidate
     )
     OR NOT EXISTS(
       SELECT 1 FROM callscore_plan_contract.quality_evaluations q
       JOIN callscore_plan_contract.generation_provenance candidate ON candidate.generation_id=q.generation_id
       WHERE q.evaluator_generation_id=p_trust_generation_id AND q.decision='ACCEPT' AND candidate.variant_id=v_candidate
     )
     OR EXISTS(SELECT 1 FROM callscore_plan_contract.runtime_variant_cooldowns c WHERE c.variant_id=v_candidate AND c.ends_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'promotion authority/independence/registry/cooldown predicate failed' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_stats FROM callscore_plan_contract.compute_runtime_experiment_statistics(p_experiment_id);
  IF v_stats.control_sample_size IS NULL OR v_stats.treatment_sample_size IS NULL OR v_stats.observation_days IS NULL
     OR v_stats.quality_delta IS NULL OR v_stats.outcome_relative_delta IS NULL OR v_stats.bootstrap_ci_lower IS NULL
     OR v_stats.safety_violations IS NULL OR v_stats.provider_verification_rate IS NULL
     OR v_stats.control_sample_size<v_e.minimum_control OR v_stats.treatment_sample_size<v_e.minimum_treatment
     OR v_stats.observation_days<v_e.minimum_observation_days OR v_stats.quality_delta<v_e.minimum_quality_delta
     OR v_stats.outcome_relative_delta<v_e.minimum_outcome_relative_delta OR v_stats.bootstrap_ci_lower<v_e.minimum_ci_lower_bound
     OR v_stats.safety_violations>v_e.maximum_safety_violations OR v_stats.provider_verification_rate<v_e.minimum_provider_verification_rate THEN
    RAISE EXCEPTION 'promotion statistics under threshold' USING ERRCODE='23514';
  END IF;
  UPDATE callscore_plan_contract.runtime_registry
  SET active_variant_id=v_candidate,rollback_variant_id=v_control,registry_version=registry_version+1,updated_at=clock_timestamp()
  WHERE agent_id=v_e.agent_id AND channel=v_e.channel AND task_type=v_e.task_type AND policy_version=v_e.policy_version AND registry_version=p_expected_registry_version;
  UPDATE callscore_plan_contract.runtime_experiments SET ends_at=clock_timestamp()
   WHERE experiment_id=p_experiment_id AND (ends_at IS NULL OR ends_at>clock_timestamp());
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.runtime_promotion_events WHERE experiment_id=p_experiment_id;
  INSERT INTO callscore_plan_contract.runtime_promotion_events(
    promotion_event_id,experiment_id,sequence_no,prior_champion_variant_id,candidate_variant_id,decision,
    evaluator_generation_id,trust_generation_id,control_sample_size,treatment_sample_size,observation_days,
    quality_delta,outcome_relative_delta,bootstrap_ci95_lower,safety_violations,provider_verification_rate,controlled_reason_code,
    decision_payload,expected_registry_version
  ) VALUES (v_event,p_experiment_id,v_seq,v_control,v_candidate,'PROMOTE',p_evaluator_generation_id,p_trust_generation_id,
    v_stats.control_sample_size,v_stats.treatment_sample_size,v_stats.observation_days,v_stats.quality_delta,
    v_stats.outcome_relative_delta,v_stats.bootstrap_ci_lower,v_stats.safety_violations,v_stats.provider_verification_rate,
    'all_db_recomputed_thresholds_passed',jsonb_build_object('statistics_function','compute_runtime_experiment_statistics.v1'),p_expected_registry_version);
  RETURN v_event;
END;
$$;

CREATE FUNCTION rollback_runtime_variant(
  p_experiment_id uuid,
  p_expected_registry_version bigint,
  p_trigger_measurement_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_e callscore_plan_contract.runtime_experiments; v_r callscore_plan_contract.runtime_registry; v_stats record;
        v_event uuid:=gen_random_uuid(); v_seq bigint;
BEGIN
  SELECT * INTO v_e FROM callscore_plan_contract.runtime_experiments WHERE experiment_id=p_experiment_id;
  SELECT * INTO v_r FROM callscore_plan_contract.runtime_registry WHERE agent_id=v_e.agent_id AND channel=v_e.channel AND task_type=v_e.task_type AND policy_version=v_e.policy_version FOR UPDATE;
  IF v_r.registry_version<>p_expected_registry_version OR v_r.rollback_variant_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.outcome_measurements WHERE measurement_id=p_trigger_measurement_id AND experiment_id=p_experiment_id) THEN
    RAISE EXCEPTION 'rollback registry/trigger predicate failed' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_stats FROM callscore_plan_contract.compute_runtime_experiment_statistics(p_experiment_id);
  IF v_stats.treatment_sample_size IS NULL OR v_stats.safety_violations IS NULL
     OR v_stats.provider_verification_rate IS NULL OR v_stats.quality_delta IS NULL
     OR v_stats.outcome_relative_delta IS NULL OR v_stats.bootstrap_ci_lower IS NULL
     OR v_stats.treatment_sample_size<1 OR NOT (
       v_stats.safety_violations>0 OR v_stats.provider_verification_rate<1
       OR v_stats.quality_delta<=-0.05 OR v_stats.outcome_relative_delta<=-0.10 OR v_stats.bootstrap_ci_lower< -0.05
     ) THEN RAISE EXCEPTION 'automatic rollback threshold not met' USING ERRCODE='23514'; END IF;
  UPDATE callscore_plan_contract.runtime_registry
  SET active_variant_id=v_r.rollback_variant_id,rollback_variant_id=NULL,registry_version=registry_version+1,updated_at=clock_timestamp()
  WHERE agent_id=v_e.agent_id AND channel=v_e.channel AND task_type=v_e.task_type AND policy_version=v_e.policy_version AND registry_version=p_expected_registry_version;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.runtime_promotion_events WHERE experiment_id=p_experiment_id;
  INSERT INTO callscore_plan_contract.runtime_promotion_events(
    promotion_event_id,experiment_id,sequence_no,prior_champion_variant_id,candidate_variant_id,decision,
    control_sample_size,treatment_sample_size,observation_days,quality_delta,outcome_relative_delta,
    bootstrap_ci95_lower,safety_violations,provider_verification_rate,controlled_reason_code,
    decision_payload,expected_registry_version
  ) VALUES (v_event,p_experiment_id,v_seq,v_r.active_variant_id,v_r.rollback_variant_id,'ROLLBACK',
    v_stats.control_sample_size,v_stats.treatment_sample_size,v_stats.observation_days,v_stats.quality_delta,
    v_stats.outcome_relative_delta,v_stats.bootstrap_ci_lower,v_stats.safety_violations,v_stats.provider_verification_rate,
    'rollback_automatic_post_promotion_regression',jsonb_build_object('trigger_measurement_id',p_trigger_measurement_id,'statistics_function','compute_runtime_experiment_statistics.v1'),p_expected_registry_version);
  INSERT INTO callscore_plan_contract.runtime_variant_cooldowns(
    cooldown_id,variant_id,sequence_no,starts_at,ends_at,controlled_reason_code
  ) VALUES (gen_random_uuid(),v_r.active_variant_id,
    COALESCE((SELECT max(sequence_no)+1 FROM callscore_plan_contract.runtime_variant_cooldowns WHERE variant_id=v_r.active_variant_id),1),
    clock_timestamp(),clock_timestamp()+interval '14 days','automatic_rollback_cooldown');
  RETURN v_event;
END;
$$;

CREATE FUNCTION record_provider_readback_evidence(
  p_readback_evidence_id uuid,p_operation_id uuid,p_evidence_type text,
  p_dispatch_window_started_at timestamptz,p_dispatch_window_ended_at timestamptz,
  p_external_object_id text,p_external_url text,p_visibility text,p_performed boolean,
  p_evidence_artifact_id uuid,p_verifier_agent_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_o callscore_plan_contract.provider_operations; v_artifact callscore_plan_contract.autonomy_artifacts;
        v_dispatch_at timestamptz; v_seq bigint; v_expected_kind text; v_subject_sha text; v_validation_schema text;
BEGIN
  SELECT * INTO v_o FROM callscore_plan_contract.provider_operations WHERE operation_id=p_operation_id FOR UPDATE;
  SELECT min(dispatch_boundary_at) INTO v_dispatch_at FROM callscore_plan_contract.provider_operation_events
   WHERE operation_id=p_operation_id AND to_state='DISPATCHING';
  v_expected_kind:=CASE p_evidence_type WHEN 'EXECUTION' THEN 'provider_execution_receipt'
    WHEN 'READBACK' THEN 'provider_readback_receipt' WHEN 'ABSENCE' THEN 'provider_absence_readback_receipt' ELSE NULL END;
  v_validation_schema:=CASE p_evidence_type WHEN 'EXECUTION' THEN 'provider-execution-evidence.v1'
    WHEN 'READBACK' THEN 'provider-readback-evidence.v1' WHEN 'ABSENCE' THEN 'provider-absence-evidence.v1' ELSE NULL END;
  SELECT * INTO v_artifact FROM callscore_plan_contract.autonomy_artifacts
   WHERE artifact_id=p_evidence_artifact_id AND artifact_kind=v_expected_kind;
  IF v_o.operation_id IS NULL OR v_artifact.artifact_id IS NULL OR v_dispatch_at IS NULL
     OR p_dispatch_window_started_at>v_dispatch_at OR p_dispatch_window_ended_at< v_dispatch_at
     OR p_verifier_agent_id=v_o.lease_owner
     OR p_verifier_agent_id IS DISTINCT FROM v_artifact.verified_by_agent_id
     OR p_verifier_agent_id=v_artifact.created_by_agent_id
     OR (p_evidence_type='ABSENCE' AND (p_performed OR p_external_object_id IS NOT NULL OR p_external_url IS NOT NULL))
     OR (p_evidence_type IN ('EXECUTION','READBACK') AND (NOT p_performed OR p_external_object_id IS NULL OR btrim(p_external_object_id)=''
          OR p_external_url !~ '^https://[^[:space:]]+$'))
     OR (p_evidence_type='READBACK' AND (p_external_url IS NULL OR btrim(p_external_url)=''
         OR p_visibility IS NULL OR lower(p_visibility)<>'public')) THEN
    RAISE EXCEPTION 'provider evidence exact identity/window/independence predicate failed' USING ERRCODE='23514';
  END IF;
  v_subject_sha:=encode(sha256(convert_to(jsonb_build_object(
    'operation_id',p_operation_id,'publication_revision',v_o.publication_revision,'account_scope_hash',v_o.account_scope_hash,
    'provider_tool',v_o.provider_tool,'action_name',v_o.action_name,'payload_sha256',v_o.payload_sha256,
    'evidence_type',p_evidence_type,'external_object_id',p_external_object_id,'external_url',p_external_url,
    'visibility',p_visibility,'performed',p_performed
  )::text,'UTF8')),'hex');
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.verified_evidence_bindings b
    WHERE b.evidence_artifact_id=p_evidence_artifact_id AND b.subject_kind='provider_operation_evidence'
      AND b.subject_id=p_operation_id::text||':'||p_evidence_type AND b.subject_sha256=v_subject_sha
      AND b.validation_schema=v_validation_schema AND b.verifier_agent_id=p_verifier_agent_id
  ) THEN RAISE EXCEPTION 'provider evidence lacks independently authenticated subject binding' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.provider_readback_evidence WHERE operation_id=p_operation_id;
  INSERT INTO callscore_plan_contract.provider_readback_evidence(
    readback_evidence_id,operation_id,sequence_no,evidence_type,account_scope_hash,provider_tool,action_name,
    payload_sha256,publication_revision,dispatch_window_started_at,dispatch_window_ended_at,external_object_id,
    external_url,visibility,performed,evidence_artifact_id,verifier_agent_id
  ) VALUES(p_readback_evidence_id,p_operation_id,v_seq,p_evidence_type,v_o.account_scope_hash,v_o.provider_tool,v_o.action_name,
    v_o.payload_sha256,v_o.publication_revision,p_dispatch_window_started_at,p_dispatch_window_ended_at,p_external_object_id,
    p_external_url,p_visibility,p_performed,p_evidence_artifact_id,p_verifier_agent_id);
  RETURN p_readback_evidence_id;
END;
$$;

CREATE FUNCTION record_provider_result(
  p_operation_id uuid,
  p_expected_version bigint,
  p_lease_token uuid,
  p_to_state callscore_provider_state,
  p_reason text,
  p_provider_response_sha256 char(64),
  p_external_object_id text,
  p_external_url text,
  p_receipt_artifact_id uuid
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_prior callscore_plan_contract.callscore_provider_state; v_row callscore_plan_contract.provider_operations;
        v_evidence callscore_plan_contract.provider_readback_evidence; v_artifact callscore_plan_contract.autonomy_artifacts; v_expected_type text;
BEGIN
  SELECT provider_state INTO v_prior FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_operation_id AND state_version=p_expected_version AND lease_token=p_lease_token
     AND lease_expires_at>clock_timestamp() FOR UPDATE;
  IF v_prior IS NULL THEN RAISE EXCEPTION 'provider result CAS/lease mismatch' USING ERRCODE='40001'; END IF;
  IF NOT ((v_prior='DISPATCHING' AND p_to_state IN ('SUBMITTED','UNKNOWN','FAILED_TERMINAL'))
       OR (v_prior='SUBMITTED' AND p_to_state IN ('VERIFIED','UNKNOWN','FAILED_TERMINAL'))) THEN
    RAISE EXCEPTION 'provider result transition forbidden' USING ERRCODE='23514';
  END IF;
  IF p_to_state IN ('SUBMITTED','VERIFIED') AND (p_receipt_artifact_id IS NULL OR p_external_object_id IS NULL) THEN
    RAISE EXCEPTION 'provider success state requires durable receipt and external id' USING ERRCODE='23514';
  END IF;
  IF p_to_state IN ('SUBMITTED','VERIFIED') THEN
    v_expected_type:=CASE WHEN p_to_state='SUBMITTED' THEN 'EXECUTION' ELSE 'READBACK' END;
    SELECT e.* INTO v_evidence FROM callscore_plan_contract.provider_readback_evidence e
     JOIN callscore_plan_contract.provider_operations o ON o.operation_id=e.operation_id
     WHERE e.operation_id=p_operation_id AND e.evidence_type=v_expected_type
       AND e.evidence_artifact_id=p_receipt_artifact_id AND e.performed
       AND e.account_scope_hash=o.account_scope_hash AND e.provider_tool=o.provider_tool
       AND e.action_name=o.action_name AND e.payload_sha256=o.payload_sha256
       AND e.publication_revision=o.publication_revision AND e.external_object_id=p_external_object_id
       AND e.external_url IS NOT DISTINCT FROM p_external_url;
    SELECT * INTO v_artifact FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_receipt_artifact_id;
    IF v_evidence.readback_evidence_id IS NULL OR v_artifact.content_sha256<>p_provider_response_sha256 THEN
      RAISE EXCEPTION 'provider success evidence is not exact-bound' USING ERRCODE='23514';
    END IF;
  END IF;
  UPDATE callscore_plan_contract.provider_operations
  SET provider_state=p_to_state,state_version=state_version+1,
      external_object_id=COALESCE(p_external_object_id,external_object_id),
      external_url=COALESCE(p_external_url,external_url),
      execution_receipt_artifact_id=CASE WHEN p_to_state='SUBMITTED' THEN p_receipt_artifact_id ELSE execution_receipt_artifact_id END,
      readback_receipt_artifact_id=CASE WHEN p_to_state='VERIFIED' THEN p_receipt_artifact_id ELSE readback_receipt_artifact_id END,
      updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id
  RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.provider_operation_events(
    event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code,
    provider_response_sha256,external_object_id,external_url,receipt_artifact_id
  ) VALUES (gen_random_uuid(),p_operation_id,v_row.state_version+1,v_prior,p_to_state,p_reason,
    p_provider_response_sha256,p_external_object_id,p_external_url,p_receipt_artifact_id);
  RETURN v_row;
END;
$$;

CREATE FUNCTION reconcile_ambiguous_provider_dispatch(
  p_operation_id uuid,
  p_expected_version bigint,
  p_reason text
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_row callscore_plan_contract.provider_operations; v_from callscore_plan_contract.callscore_provider_state;
BEGIN
  SELECT provider_state INTO v_from FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_operation_id AND state_version=p_expected_version
     AND provider_state IN ('DISPATCHING','SUBMITTED') AND lease_expires_at<clock_timestamp() FOR UPDATE;
  IF v_from IS NULL THEN RAISE EXCEPTION 'ambiguous dispatch not reconcilable' USING ERRCODE='40001'; END IF;
  UPDATE callscore_plan_contract.provider_operations
  SET provider_state='UNKNOWN',state_version=state_version+1,updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code)
  VALUES(gen_random_uuid(),p_operation_id,v_row.state_version+1,v_from,'UNKNOWN',p_reason);
  RETURN v_row;
END;
$$;

CREATE FUNCTION confirm_provider_not_performed(
  p_operation_id uuid,p_expected_version bigint,p_absence_receipt_artifact_id uuid,p_reason text
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_row callscore_plan_contract.provider_operations;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM callscore_plan_contract.provider_readback_evidence e
    JOIN callscore_plan_contract.provider_operations o ON o.operation_id=e.operation_id
    WHERE e.operation_id=p_operation_id AND e.evidence_type='ABSENCE' AND NOT e.performed
      AND e.evidence_artifact_id=p_absence_receipt_artifact_id
      AND e.account_scope_hash=o.account_scope_hash AND e.provider_tool=o.provider_tool
      AND e.action_name=o.action_name AND e.payload_sha256=o.payload_sha256
      AND e.publication_revision=o.publication_revision
  ) THEN RAISE EXCEPTION 'independent exact-bound provider absence receipt missing' USING ERRCODE='23514'; END IF;
  UPDATE callscore_plan_contract.provider_operations
  SET provider_state='CONFIRMED_NOT_PERFORMED',state_version=state_version+1,updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id AND state_version=p_expected_version AND provider_state='UNKNOWN'
  RETURNING * INTO v_row;
  IF v_row.operation_id IS NULL THEN RAISE EXCEPTION 'absence readback CAS failed' USING ERRCODE='40001'; END IF;
  INSERT INTO callscore_plan_contract.provider_operation_events(
    event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code,receipt_artifact_id
  ) VALUES(gen_random_uuid(),p_operation_id,v_row.state_version+1,'UNKNOWN','CONFIRMED_NOT_PERFORMED',p_reason,p_absence_receipt_artifact_id);
  RETURN v_row;
END;
$$;

CREATE FUNCTION reclaim_confirmed_not_performed(
  p_operation_id uuid,p_expected_version bigint,p_worker_id text,p_lease_token uuid
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_row callscore_plan_contract.provider_operations; v_prior text;
BEGIN
  SELECT lease_owner INTO v_prior FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_operation_id AND state_version=p_expected_version AND provider_state='CONFIRMED_NOT_PERFORMED' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'confirmed-absence reclaim CAS failed' USING ERRCODE='40001'; END IF;
  UPDATE callscore_plan_contract.provider_operations
  SET provider_state='CLAIMED',state_version=state_version+1,lease_owner=p_worker_id,lease_token=p_lease_token,
      lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
  WHERE operation_id=p_operation_id RETURNING * INTO v_row;
  INSERT INTO callscore_plan_contract.provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code)
  VALUES(gen_random_uuid(),p_operation_id,v_row.state_version+1,'CONFIRMED_NOT_PERFORMED','CLAIMED','independent_absence_proved_safe_retry');
  INSERT INTO callscore_plan_contract.provider_operation_lease_events(
    lease_event_id,operation_id,sequence_no,lease_generation,prior_lease_owner,lease_owner,lease_token,lease_expires_at,controlled_reason_code
  ) VALUES(gen_random_uuid(),p_operation_id,v_row.lease_generation,v_row.lease_generation,v_prior,p_worker_id,p_lease_token,v_row.lease_expires_at,'reclaim_after_confirmed_absence');
  RETURN v_row;
END;
$$;

-- Function/table ownership and grants. Owner roles are NOLOGIN; callers cannot SET ROLE in production.
ALTER FUNCTION set_ledger_hash() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reject_append_only_mutation() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reject_projection_delete() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reject_legacy_channel_task_reactivation() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION transition_is_allowed(callscore_execution_class,callscore_workflow_state,callscore_workflow_state) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION enqueue_autonomy_workflow(uuid,uuid,uuid,text,callscore_execution_class,text,text,text,text,jsonb,char) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION backfill_legacy_channel_tasks() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION set_activation_fence(boolean,bigint,text,text,uuid,char) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_specialist_requirement(uuid,uuid,integer,text,text,smallint,text,char,text,text,jsonb,text,uuid,uuid,char) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION create_agent_delegation(uuid,uuid,uuid,text,integer,text,text,text,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_child_join_manifest(uuid,uuid,integer,uuid,char,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_agent_delegation_event(uuid,callscore_join_status,bigint,callscore_join_status,integer,integer,bigint,text,uuid,char,uuid,char,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_autonomy_artifact(uuid,text,text,char,bigint,text,text,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_verified_evidence_binding(uuid,uuid,char,text,text,char,text,text,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_canonical_policy_snapshot(uuid,text,char,char,text,text,char,text,text,text,timestamptz,timestamptz,jsonb,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION assert_current_live_workflow_lease(uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION claim_autonomy_workflow(uuid,text,uuid,bigint,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION schedule_autonomy_retry(uuid,callscore_workflow_state,bigint,uuid,timestamptz,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION resume_due_autonomy_retry(uuid,bigint,text,uuid,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION resume_or_reclaim_autonomy_workflow(uuid,bigint,bigint,uuid,text,uuid,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION heartbeat_autonomy_workflow(uuid,bigint,bigint,uuid,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION transition_autonomy_workflow(uuid,callscore_workflow_state,callscore_workflow_state,bigint,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION mint_ready_public_owned_grant(uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION revoke_external_action_grant(uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_generation_provenance(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,jsonb,jsonb,char,jsonb,char,jsonb,uuid,jsonb,numeric,timestamptz,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_quality_gate_evidence(uuid,uuid,uuid,text,boolean,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_quality_evaluation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_artifact_revision(uuid,uuid,uuid,uuid,uuid,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION create_provider_operation_intent(uuid,uuid,char,text,text,text,uuid,boolean,boolean,uuid,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION create_provider_operation(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION mark_provider_dispatching(uuid,bigint,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_review_execution_attestation(uuid,char,char,char,text,text,text,text,smallint,uuid,uuid,char,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_autonomy_review_receipt(uuid,uuid,text,char,uuid,char,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_provider_object_rollback_receipt(uuid,text,bigint,char,uuid,uuid,uuid,timestamptz,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_runtime_variant_rollback_receipt(uuid,text,bigint,char,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION insert_verified_autonomy_report(uuid,text,bigint,char,char,char,char,char,char,text,char,char,char,char,char,char,char,char,uuid,char,text,text,uuid,char,boolean,jsonb,uuid,uuid,uuid,uuid[],uuid,uuid,uuid,uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_outcome_measurement(uuid,uuid,uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,uuid,char,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_canonical_learning_set(uuid,uuid,uuid,uuid[],jsonb[],uuid[]) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reclaim_provider_claim(uuid,bigint,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION compute_runtime_experiment_statistics(uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION assign_runtime_variant(uuid,text,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION import_runtime_experiment_bundle(jsonb,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION conclude_runtime_experiment(uuid,char,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION promote_runtime_variant(uuid,bigint,uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION rollback_runtime_variant(uuid,bigint,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_provider_readback_evidence(uuid,uuid,text,timestamptz,timestamptz,text,text,text,boolean,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_provider_result(uuid,bigint,uuid,callscore_provider_state,text,char,text,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reconcile_ambiguous_provider_dispatch(uuid,bigint,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION confirm_provider_not_performed(uuid,bigint,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reclaim_confirmed_not_performed(uuid,bigint,text,uuid) OWNER TO callscore_plan_function_owner;

GRANT USAGE ON SCHEMA callscore_plan_contract TO callscore_plan_function_owner,callscore_plan_runtime,callscore_plan_policy_writer,callscore_plan_enqueue,callscore_plan_observer,callscore_plan_report_verifier,callscore_plan_review_identity_attestor;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA callscore_plan_contract TO callscore_plan_function_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA callscore_plan_contract TO callscore_plan_runtime,callscore_plan_observer;
GRANT SELECT ON autonomy_artifacts,verified_evidence_bindings,provider_operations,provider_operation_events,provider_readback_evidence,
  review_execution_attestations,autonomy_review_receipts,provider_object_rollback_receipts,runtime_variant_rollback_receipts,
  outcome_measurements,runtime_promotion_events TO callscore_plan_report_verifier;
GRANT SELECT ON autonomy_artifacts TO callscore_plan_review_identity_attestor;
GRANT SELECT ON external_action_grants,external_action_grant_revocations,provider_operation_intents,autonomy_artifacts TO callscore_plan_policy_writer;
GRANT INSERT ON canonical_receipt_evidence,autonomy_artifacts TO callscore_plan_policy_writer;
REVOKE ALL ON ALL TABLES IN SCHEMA callscore_plan_contract FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA callscore_plan_contract FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_verified_evidence_binding(uuid,uuid,char,text,text,char,text,text,jsonb) TO callscore_plan_report_verifier;
GRANT EXECUTE ON FUNCTION record_canonical_policy_snapshot(uuid,text,char,char,text,text,char,text,text,text,timestamptz,timestamptz,jsonb,uuid) TO callscore_plan_policy_writer;
GRANT EXECUTE ON FUNCTION enqueue_autonomy_workflow(uuid,uuid,uuid,text,callscore_execution_class,text,text,text,text,jsonb,char) TO callscore_plan_enqueue;
GRANT EXECUTE ON FUNCTION
  claim_autonomy_workflow(uuid,text,uuid,bigint,integer),
  schedule_autonomy_retry(uuid,callscore_workflow_state,bigint,uuid,timestamptz,text),
  resume_due_autonomy_retry(uuid,bigint,text,uuid,integer),
  resume_or_reclaim_autonomy_workflow(uuid,bigint,bigint,uuid,text,uuid,integer),
  heartbeat_autonomy_workflow(uuid,bigint,bigint,uuid,integer),
  transition_autonomy_workflow(uuid,callscore_workflow_state,callscore_workflow_state,bigint,uuid,text),
  record_specialist_requirement(uuid,uuid,integer,text,text,smallint,text,char,text,text,jsonb,text,uuid,uuid,char),
  create_agent_delegation(uuid,uuid,uuid,text,integer,text,text,text,timestamptz),
  record_child_join_manifest(uuid,uuid,integer,uuid,char,jsonb),
  record_agent_delegation_event(uuid,callscore_join_status,bigint,callscore_join_status,integer,integer,bigint,text,uuid,char,uuid,char,jsonb),
  record_autonomy_artifact(uuid,text,text,char,bigint,text,text,text),
  record_generation_provenance(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,jsonb,jsonb,char,jsonb,char,jsonb,uuid,jsonb,numeric,timestamptz,timestamptz),
  record_quality_gate_evidence(uuid,uuid,uuid,text,boolean,uuid,text),
  record_quality_evaluation(uuid,uuid,uuid,uuid,jsonb,numeric,numeric,text),
  record_artifact_revision(uuid,uuid,uuid,uuid,uuid,jsonb),
  create_provider_operation_intent(uuid,uuid,char,text,text,text,uuid,boolean,boolean,uuid,timestamptz),
  create_provider_operation(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid),
  mark_provider_dispatching(uuid,bigint,uuid),
  reclaim_provider_claim(uuid,bigint,text,uuid),
  record_provider_result(uuid,bigint,uuid,callscore_provider_state,text,char,text,text,uuid),
  reconcile_ambiguous_provider_dispatch(uuid,bigint,text),
  confirm_provider_not_performed(uuid,bigint,uuid,text),
  reclaim_confirmed_not_performed(uuid,bigint,text,uuid),
  record_outcome_measurement(uuid,uuid,uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,uuid,char,jsonb),
  record_canonical_learning_set(uuid,uuid,uuid,uuid[],jsonb[],uuid[]),
  compute_runtime_experiment_statistics(uuid),assign_runtime_variant(uuid,text,text),
  promote_runtime_variant(uuid,bigint,uuid,uuid),rollback_runtime_variant(uuid,bigint,uuid)
TO callscore_plan_runtime;
GRANT EXECUTE ON FUNCTION set_activation_fence(boolean,bigint,text,text,uuid,char) TO callscore_plan_policy_writer;
GRANT EXECUTE ON FUNCTION mint_ready_public_owned_grant(uuid,uuid),revoke_external_action_grant(uuid,text),import_runtime_experiment_bundle(jsonb,uuid),conclude_runtime_experiment(uuid,char,uuid,text) TO callscore_plan_policy_writer;
GRANT EXECUTE ON FUNCTION record_review_execution_attestation(uuid,char,char,char,text,text,text,text,smallint,uuid,uuid,char,text) TO callscore_plan_review_identity_attestor;
GRANT EXECUTE ON FUNCTION record_provider_readback_evidence(uuid,uuid,text,timestamptz,timestamptz,text,text,text,boolean,uuid,text),
  record_autonomy_review_receipt(uuid,uuid,text,char,uuid,char,text),
  record_provider_object_rollback_receipt(uuid,text,bigint,char,uuid,uuid,uuid,timestamptz,timestamptz),
  record_runtime_variant_rollback_receipt(uuid,text,bigint,char,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,timestamptz),
  insert_verified_autonomy_report(uuid,text,bigint,char,char,char,char,char,char,text,char,char,char,char,char,char,char,char,uuid,char,text,text,uuid,char,boolean,jsonb,uuid,uuid,uuid,uuid[],uuid,uuid,uuid,uuid,uuid)
TO callscore_plan_report_verifier;

-- Contract probes.
INSERT INTO agent_instances(agent_id) VALUES ('callscore-x-head');
INSERT INTO channel_tasks(id,agent_id,channel_id,task_type,status,idempotency_key,payload_hash,payload)
VALUES
('01000000-0000-0000-0000-000000000001','callscore-x-head','x','x_owned_post','pending','fixture-task-1',repeat('a',64),'{}'),
('01000000-0000-0000-0000-000000000002','callscore-x-head','x','x_owned_post','pending','fixture-task-2',repeat('b',64),'{}'),
('01000000-0000-0000-0000-000000000003','callscore-x-head','x','engagement_discovery','pending','fixture-task-3',repeat('c',64),'{}'),
('01000000-0000-0000-0000-000000000004','callscore-x-head','x','legacy_unknown','running','fixture-task-4',repeat('d',64),'{}'),
('01000000-0000-0000-0000-000000000005','callscore-x-head','x','legacy_done','succeeded','fixture-task-5',repeat('e',64),'{}');

SET LOCAL ROLE callscore_plan_enqueue;
SELECT enqueue_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',
  '01000000-0000-0000-0000-000000000001','fixture-task-1','OWNED_PUBLIC_MUTATION','callscore-x-head','x','x_owned_post','policy-v1','{}',repeat('a',64)
);
RESET ROLE;

SELECT backfill_legacy_channel_tasks();
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000002' AND execution_class='RESTRICTED_DRAFT' AND workflow_state='QUEUED')
     OR NOT EXISTS(SELECT 1 FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000003' AND execution_class='READ_ONLY_OBSERVATION' AND workflow_state='QUEUED')
     OR NOT EXISTS(SELECT 1 FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000004' AND workflow_state='FAILED' AND terminal_reason_code='legacy_running_reconciliation_required')
     OR EXISTS(SELECT 1 FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000005')
     OR EXISTS(SELECT 1 FROM channel_tasks WHERE id IN ('01000000-0000-0000-0000-000000000001','01000000-0000-0000-0000-000000000002','01000000-0000-0000-0000-000000000003','01000000-0000-0000-0000-000000000004') AND status<>'blocked') THEN
    RAISE EXCEPTION 'legacy backfill executable probe failed';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE callscore_plan_runtime;
    INSERT INTO callscore_plan_contract.external_action_grants(
      grant_id,workflow_id,intent_id,sequence_no,authority_source,policy_snapshot_id,account_scope_hash,mutation_family,
      provider_tool,action_name,publication_revision,payload_sha256,issued_by_role,issued_at,expires_at
    ) VALUES (
      gen_random_uuid(),'00000000-0000-0000-0000-000000000001',gen_random_uuid(),1,'READY_PUBLIC_OWNED_POLICY',gen_random_uuid(),
      repeat('b',64),'social','X_CREATE_POST','create',0,repeat('c',64),'callscore_function_owner',clock_timestamp(),clock_timestamp()+interval '1 minute'
    );
    RESET ROLE;
    RAISE EXCEPTION 'runtime direct grant INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
END;
$$;

SET LOCAL ROLE callscore_plan_policy_writer;
INSERT INTO autonomy_artifacts(
  artifact_id,artifact_kind,artifact_uri,content_sha256,byte_length,media_type,created_by_agent_id,verified_by_agent_id
) VALUES(
  '40900000-0000-0000-0000-000000000001','activation_approval_receipt.v2',
  '/srv/agents/hermes/profiles/callscore/runtime/children/activation-approval.json',repeat('f',64),100,'application/json',
  'callscore-deployment-author','callscore-activation-reviewer'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'40900000-0000-0000-0000-000000000001',repeat('f',64),
  'activation_fence','unfence:0',repeat('e',64),'activation-approval.v2','callscore-activation-reviewer',
  '{"deployment_tuple":"fixture-exact-target"}'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
SELECT set_activation_fence(
  false,0,'fixture_unfence','callscore_plan_policy_writer',
  '40900000-0000-0000-0000-000000000001',repeat('e',64)
);
RESET ROLE;

SET LOCAL ROLE callscore_plan_runtime;
SELECT (claim_autonomy_workflow('00000000-0000-0000-0000-000000000001','fixture-worker','00000000-0000-0000-0000-000000000201',0,30)).workflow_state;
SELECT (heartbeat_autonomy_workflow('00000000-0000-0000-0000-000000000001',1,0,'00000000-0000-0000-0000-000000000201',30)).lease_generation;
RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO autonomy_workflow_transitions(
      transition_id,workflow_id,sequence_no,from_state,to_state,from_state_version,to_state_version,lease_generation,controlled_reason_code
    ) VALUES (gen_random_uuid(),'00000000-0000-0000-0000-000000000001',3,'HEAD_PLANNING','CHILDREN_RUNNING',1,2,1,'sequence_fork');
    RAISE EXCEPTION 'non-monotonic hash-chain insert unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE autonomy_workflow_transitions SET controlled_reason_code='forged';
    RAISE EXCEPTION 'append-only UPDATE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM autonomy_workflows WHERE workflow_id='00000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'projection DELETE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;


-- Exercise workflow same-identity recovery, expired reclaim, exact RETRY scheduling, and due-time resume.
SET LOCAL ROLE callscore_plan_runtime;
SELECT (resume_or_reclaim_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001',1,1,'00000000-0000-0000-0000-000000000201',
  'fixture-worker','00000000-0000-0000-0000-000000000202',30
)).lease_generation;
RESET ROLE;
UPDATE autonomy_workflows SET lease_expires_at=clock_timestamp()-interval '1 second'
 WHERE workflow_id='00000000-0000-0000-0000-000000000001';
SET LOCAL ROLE callscore_plan_runtime;
SELECT (resume_or_reclaim_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001',1,2,'00000000-0000-0000-0000-000000000202',
  'fixture-reclaimer','00000000-0000-0000-0000-000000000203',30
)).lease_generation;
SELECT set_config('callscore.workflow_lease_token','00000000-0000-0000-0000-000000000203',true);
SELECT set_config('callscore.workflow_lease_owner','fixture-reclaimer',true);
SELECT record_autonomy_artifact(
  '40000000-0000-0000-0000-000000000010','runtime_experiment_bundle_review_receipt',
  '/srv/agents/hermes/profiles/callscore/runtime/children/experiment-review.json',repeat('a',64),100,'application/json',
  'callscore-experiment-reviewer','callscore-trust-reviewer'
);
CREATE TEMP TABLE fixture_experiment_bundle AS
SELECT jsonb_build_object(
    'schema','callscore.runtime_experiment_bundle.v1','experiment_id','60000000-0000-0000-0000-000000000001',
    'agent_id','callscore-x-head','channel','x','task_type','x_owned_post','policy_version','policy-v1',
    'primary_metric','engagement_rate',
    'eligibility_contract',jsonb_build_object('require_terminal_complete',true,'require_outcome',true,'require_accepted_quality',true),
    'bootstrap_contract',jsonb_build_object('method','percentile_bootstrap','statistic','relative_mean_delta','missing_data','exclude'),
    'bootstrap_resamples',10000,'bootstrap_seed',42,'minimum_control',30,'minimum_treatment',30,
    'minimum_observation_days',14,'treatment_ratio',20,'starts_at','2026-07-01T00:00:00Z',
    'control',jsonb_build_object('variant_id','61000000-0000-0000-0000-000000000001','cohort_id','62000000-0000-0000-0000-000000000001',
      'prompt_name','x-head','prompt_version','v1','prompt_sha256',repeat('1',64),'model','m','provider','p','parameters','{}'::jsonb,
      'tools_manifest_sha256',repeat('2',64),'skills_manifest_sha256',repeat('3',64),'created_from_variant_id',''),
    'treatment',jsonb_build_object('variant_id','61000000-0000-0000-0000-000000000002','cohort_id','62000000-0000-0000-0000-000000000002',
      'prompt_name','x-head','prompt_version','v2','prompt_sha256',repeat('4',64),'model','m','provider','p','parameters','{}'::jsonb,
      'tools_manifest_sha256',repeat('5',64),'skills_manifest_sha256',repeat('6',64),'created_from_variant_id','61000000-0000-0000-0000-000000000001')
  ) AS bundle;
GRANT SELECT ON fixture_experiment_bundle TO callscore_plan_report_verifier,callscore_plan_policy_writer;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'40000000-0000-0000-0000-000000000010',repeat('a',64),
  'runtime_experiment_bundle','60000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to(bundle::text,'UTF8')),'hex'),'runtime-experiment-bundle-review.v1','callscore-trust-reviewer',
  '{"review":"exact_bundle_digest"}'
) FROM fixture_experiment_bundle;
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
DO $$
DECLARE v_bundle jsonb:=(SELECT bundle FROM fixture_experiment_bundle);
DECLARE v_first uuid; v_second uuid;
BEGIN
  v_first:=import_runtime_experiment_bundle(v_bundle,'40000000-0000-0000-0000-000000000010');
  v_second:=import_runtime_experiment_bundle(v_bundle,'40000000-0000-0000-0000-000000000010');
  IF v_first<>v_second THEN RAISE EXCEPTION 'identical experiment bundle import was not idempotent'; END IF;
  BEGIN
    PERFORM import_runtime_experiment_bundle(
      v_bundle||jsonb_build_object('bootstrap_seed','54322'),
      '40000000-0000-0000-0000-000000000010'
    );
    RAISE EXCEPTION 'changed experiment bundle reused immutable experiment id';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Migration-only canonical default variants for every child producer used by this workflow.
INSERT INTO runtime_experiments(
  experiment_id,agent_id,channel,task_type,policy_version,primary_metric,eligibility_contract,bootstrap_contract,
  bootstrap_resamples,bootstrap_seed,minimum_control,minimum_treatment,minimum_observation_days,
  minimum_outcome_relative_delta,minimum_quality_delta,minimum_ci_lower_bound,minimum_provider_verification_rate,
  maximum_safety_violations,treatment_ratio,bundle_sha256,review_receipt_artifact_id,starts_at,ends_at
) VALUES
  ('62000000-0000-0000-0000-000000000001','callscore-evaluator-child','x','x_owned_post','policy-v1','fixture-baseline',
   '{"require_terminal_complete":true,"require_outcome":true,"require_accepted_quality":true}','{"method":"percentile_bootstrap"}',10000,43,30,30,14,0.10,0.03,0,1,0,20,repeat('e',64),'40000000-0000-0000-0000-000000000010',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'),
  ('62000000-0000-0000-0000-000000000002','callscore-critic-child','x','x_owned_post','policy-v1','fixture-baseline',
   '{"require_terminal_complete":true,"require_outcome":true,"require_accepted_quality":true}','{"method":"percentile_bootstrap"}',10000,44,30,30,14,0.10,0.03,0,1,0,20,repeat('f',64),'40000000-0000-0000-0000-000000000010',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day');
INSERT INTO runtime_variants(
  variant_id,experiment_id,agent_id,channel,task_type,policy_version,prompt_name,prompt_version,prompt_sha256,
  model,provider,parameters,tools_manifest_sha256,skills_manifest_sha256,definition_sha256
) VALUES
  ('63000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','callscore-evaluator-child','x','x_owned_post','policy-v1','x-eval','v1',repeat('3',64),'m','p','{}',repeat('8',64),repeat('9',64),repeat('d',64)),
  ('63000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000002','callscore-critic-child','x','x_owned_post','policy-v1','x-critic','v1',repeat('6',64),'m','p','{}',repeat('a',64),repeat('b',64),repeat('e',64));
INSERT INTO runtime_registry(agent_id,channel,task_type,policy_version,active_variant_id,registry_version) VALUES
  ('callscore-evaluator-child','x','x_owned_post','policy-v1','63000000-0000-0000-0000-000000000001',1),
  ('callscore-critic-child','x','x_owned_post','policy-v1','63000000-0000-0000-0000-000000000002',1);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT record_autonomy_artifact('40100000-0000-0000-0000-000000000001','task_router_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/router-requirements.json',repeat('1',64),100,'application/json','callscore-task-router','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40100000-0000-0000-0000-000000000002','tool_inheritance_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/tool-requirements.json',repeat('2',64),100,'application/json','callscore-tool-router','callscore-supervisor-verifier');
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(gen_random_uuid(),'40100000-0000-0000-0000-000000000001',repeat('1',64),'specialist_requirement',r.requirement_id::text,r.requirement_sha256,'callscore.task_router_receipt.v1','callscore-supervisor-verifier','{"source":"canonical_task_router"}')
FROM (VALUES
  ('50100000-0000-0000-0000-000000000001'::uuid,repeat('a',64)::char(64)),
  ('50100000-0000-0000-0000-000000000002'::uuid,repeat('b',64)::char(64)),
  ('50100000-0000-0000-0000-000000000003'::uuid,repeat('c',64)::char(64))
) r(requirement_id,requirement_sha256);
SELECT record_verified_evidence_binding(gen_random_uuid(),'40100000-0000-0000-0000-000000000002',repeat('2',64),'specialist_requirement',r.requirement_id::text,r.requirement_sha256,'callscore.tool_inheritance_receipt.v1','callscore-supervisor-verifier','{"source":"canonical_tool_inheritance"}')
FROM (VALUES
  ('50100000-0000-0000-0000-000000000001'::uuid,repeat('a',64)::char(64)),
  ('50100000-0000-0000-0000-000000000002'::uuid,repeat('b',64)::char(64)),
  ('50100000-0000-0000-0000-000000000003'::uuid,repeat('c',64)::char(64))
) r(requirement_id,requirement_sha256);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT record_specialist_requirement('50100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',0,'SYNTHESIS_INPUT','analyst',0::smallint,'callscore-evaluator-child',repeat('3',64),'m','p','{}','callscore.child_output.v1','40100000-0000-0000-0000-000000000001','40100000-0000-0000-0000-000000000002',repeat('a',64));
SELECT record_specialist_requirement('50100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',0,'SYNTHESIS_INPUT','critic',1::smallint,'callscore-critic-child',repeat('4',64),'m','p','{}','callscore.child_output.v1','40100000-0000-0000-0000-000000000001','40100000-0000-0000-0000-000000000002',repeat('b',64));
SELECT record_specialist_requirement('50100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',0,'POST_SYNTHESIS_EVALUATOR','evaluator',2::smallint,'callscore-evaluator-child',repeat('3',64),'m','p','{}','callscore.child_output.v1','40100000-0000-0000-0000-000000000001','40100000-0000-0000-0000-000000000002',repeat('c',64));
SELECT assign_runtime_variant('00000000-0000-0000-0000-000000000001','callscore-x-head','head-synthesizer');
SELECT (transition_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001','HEAD_PLANNING','CHILDREN_RUNNING',1,
  '00000000-0000-0000-0000-000000000203','fixture_children_start'
)).state_version;
SELECT (schedule_autonomy_retry(
  '00000000-0000-0000-0000-000000000001','CHILDREN_RUNNING',2,
  '00000000-0000-0000-0000-000000000203',clock_timestamp()+interval '1 second','fixture_retry'
)).workflow_state;
RESET ROLE;
UPDATE autonomy_workflows SET retry_at=clock_timestamp()-interval '1 second'
 WHERE workflow_id='00000000-0000-0000-0000-000000000001';
SET LOCAL ROLE callscore_plan_runtime;
SELECT (resume_due_autonomy_retry(
  '00000000-0000-0000-0000-000000000001',3,'fixture-worker','00000000-0000-0000-0000-000000000204',30
)).workflow_state;
SELECT set_config('callscore.workflow_lease_token','00000000-0000-0000-0000-000000000204',true);
SELECT set_config('callscore.workflow_lease_owner','fixture-worker',true);

-- Negative probe: task-bound writers reject a stale/wrong workflow lease context.
SELECT set_config('callscore.workflow_lease_token','00000000-0000-0000-0000-000000000099',true);
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM create_agent_delegation(
      '50900000-0000-0000-0000-000000000001','50100000-0000-0000-0000-000000000001',
      '51900000-0000-0000-0000-000000000001','/usr/bin/hermes',1000,'/opt/crypto-tuber-ranked',
      '/srv/agents/hermes/profiles/callscore/runtime/children/negative.usage','/srv/agents/hermes/profiles/callscore/runtime/children/negative.out',
      clock_timestamp()+interval '2 minutes'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'task-bound writer accepted stale/wrong workflow lease'; END IF;
END;
$$;
SELECT set_config('callscore.workflow_lease_token','00000000-0000-0000-0000-000000000204',true);

-- Exercise task-bound child intent plus parent-observed process identity and restart generation.
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000001','hermes_usage','/srv/agents/hermes/profiles/callscore/runtime/children/probe-a.usage',repeat('1',64),10,'application/json','callscore-evaluator-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000002','child_output','/srv/agents/hermes/profiles/callscore/runtime/children/probe-a.out',repeat('2',64),20,'application/json','callscore-evaluator-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000003','hermes_usage','/srv/agents/hermes/profiles/callscore/runtime/children/probe-b.usage',repeat('3',64),10,'application/json','callscore-critic-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000004','child_output','/srv/agents/hermes/profiles/callscore/runtime/children/probe-b.out',repeat('4',64),20,'application/json','callscore-critic-child','callscore-supervisor-verifier');
SELECT create_agent_delegation(
  '50000000-0000-0000-0000-000000000001','50100000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001','/usr/bin/hermes',1000,'/opt/crypto-tuber-ranked',
  '/srv/agents/hermes/profiles/callscore/runtime/children/probe-a.usage','/srv/agents/hermes/profiles/callscore/runtime/children/probe-a.out',
  clock_timestamp()+interval '2 minutes'
);
SELECT assign_runtime_variant('00000000-0000-0000-0000-000000000001','callscore-evaluator-child','analyst');
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000001','DISPATCH_INTENT',1,'SPAWNED',12345,12345,999,'session-probe-a',NULL,NULL,NULL,NULL,'{"source":"parent_procfs"}')).launch_status;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000001','SPAWNED',1,'SUCCEEDED',12345,12345,999,'session-probe-a','40000000-0000-0000-0000-000000000001',repeat('1',64),'40000000-0000-0000-0000-000000000002',repeat('2',64),'{"source":"parent_wait4"}')).launch_status;
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM record_agent_delegation_event('50000000-0000-0000-0000-000000000001','SUCCEEDED',1,'ACCEPTED',12345,12345,999,'session-probe-a','40000000-0000-0000-0000-000000000001',repeat('1',64),'40000000-0000-0000-0000-000000000002',repeat('2',64),'{"source":"unbound_negative_probe"}');
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'child acceptance without independent process/output binding succeeded'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000001',repeat('1',64),'child_process_identity','50000000-0000-0000-0000-000000000001',repeat('1',64),'hermes-child-process-identity.v1','callscore-supervisor-verifier','{"pid":12345,"pgid":12345,"start_ticks":999,"session_id":"session-probe-a","source":"parent_procfs_wait4"}');
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000002',repeat('2',64),'child_output','50000000-0000-0000-0000-000000000001',repeat('2',64),'callscore.child_output.v1','callscore-supervisor-verifier','{"source":"parent_output_schema_validator"}');
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000001','SUCCEEDED',1,'ACCEPTED',12345,12345,999,'session-probe-a','40000000-0000-0000-0000-000000000001',repeat('1',64),'40000000-0000-0000-0000-000000000002',repeat('2',64),'{"source":"parent_verifier"}')).launch_status;
SELECT create_agent_delegation(
  '50000000-0000-0000-0000-000000000002','50100000-0000-0000-0000-000000000002',
  '51000000-0000-0000-0000-000000000002','/usr/bin/hermes',1000,'/opt/crypto-tuber-ranked',
  '/srv/agents/hermes/profiles/callscore/runtime/children/probe-b.usage','/srv/agents/hermes/profiles/callscore/runtime/children/probe-b.out',
  clock_timestamp()+interval '2 minutes'
);
SELECT assign_runtime_variant('00000000-0000-0000-0000-000000000001','callscore-critic-child','critic');
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000002','DISPATCH_INTENT',1,'SPAWNED',12346,12346,1000,'session-probe-b',NULL,NULL,NULL,NULL,'{"source":"parent_procfs"}')).launch_status;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000002','SPAWNED',1,'SUCCEEDED',12346,12346,1000,'session-probe-b','40000000-0000-0000-0000-000000000003',repeat('3',64),'40000000-0000-0000-0000-000000000004',repeat('4',64),'{"source":"parent_wait4"}')).launch_status;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000003',repeat('3',64),'child_process_identity','50000000-0000-0000-0000-000000000002',repeat('3',64),'hermes-child-process-identity.v1','callscore-supervisor-verifier','{"pid":12346,"pgid":12346,"start_ticks":1000,"session_id":"session-probe-b","source":"parent_procfs_wait4"}');
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000004',repeat('4',64),'child_output','50000000-0000-0000-0000-000000000002',repeat('4',64),'callscore.child_output.v1','callscore-supervisor-verifier','{"source":"parent_output_schema_validator"}');
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000002','SUCCEEDED',1,'ACCEPTED',12346,12346,1000,'session-probe-b','40000000-0000-0000-0000-000000000003',repeat('3',64),'40000000-0000-0000-0000-000000000004',repeat('4',64),'{"source":"parent_verifier"}')).launch_status;
WITH manifest AS (SELECT jsonb_build_array(
    jsonb_build_object('requirement_id','50100000-0000-0000-0000-000000000001','delegation_id','50000000-0000-0000-0000-000000000001','output_artifact_id','40000000-0000-0000-0000-000000000002','output_sha256',repeat('2',64)),
    jsonb_build_object('requirement_id','50100000-0000-0000-0000-000000000002','delegation_id','50000000-0000-0000-0000-000000000002','output_artifact_id','40000000-0000-0000-0000-000000000004','output_sha256',repeat('4',64))
  ) AS members)
SELECT record_autonomy_artifact('40200000-0000-0000-0000-000000000001','child_join_manifest','/srv/agents/hermes/profiles/callscore/runtime/children/join-manifest.json',
  encode(sha256(convert_to(members::text,'UTF8')),'hex'),octet_length(convert_to(members::text,'UTF8')),'application/json','callscore-x-head','callscore-supervisor-verifier') FROM manifest;
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM record_child_join_manifest('50200000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000001',0,
      '40200000-0000-0000-0000-000000000001',repeat('5',64),
      jsonb_build_array(jsonb_build_object('requirement_id','50100000-0000-0000-0000-000000000001','delegation_id','50000000-0000-0000-0000-000000000001','output_artifact_id','40000000-0000-0000-0000-000000000002','output_sha256',repeat('2',64))));
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'incomplete required-child manifest unexpectedly succeeded'; END IF;
END;
$$;
WITH manifest AS (SELECT jsonb_build_array(
    jsonb_build_object('requirement_id','50100000-0000-0000-0000-000000000001','delegation_id','50000000-0000-0000-0000-000000000001','output_artifact_id','40000000-0000-0000-0000-000000000002','output_sha256',repeat('2',64)),
    jsonb_build_object('requirement_id','50100000-0000-0000-0000-000000000002','delegation_id','50000000-0000-0000-0000-000000000002','output_artifact_id','40000000-0000-0000-0000-000000000004','output_sha256',repeat('4',64))
  ) AS members)
SELECT record_child_join_manifest('50200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',0,
  '40200000-0000-0000-0000-000000000001',encode(sha256(convert_to(members::text,'UTF8')),'hex'),members) FROM manifest;
SELECT (transition_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001','CHILDREN_RUNNING','HEAD_SYNTHESIS',4,
  '00000000-0000-0000-0000-000000000204','fixture_children_joined'
)).state_version;
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000020','resolved_prompt','/srv/agents/hermes/profiles/callscore/runtime/children/head.prompt',repeat('1',64),100,'text/plain','callscore-x-head','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000021','prompt_secret_scan_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/head.scan',repeat('1',64),50,'application/json','callscore-secret-scanner','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000022','generation_output','/srv/agents/hermes/profiles/callscore/runtime/children/head.output',repeat('2',64),200,'application/json','callscore-x-head','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000023','resolved_prompt','/srv/agents/hermes/profiles/callscore/runtime/children/evaluator.prompt',repeat('3',64),100,'text/plain','callscore-evaluator-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000024','prompt_secret_scan_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/evaluator.scan',repeat('4',64),50,'application/json','callscore-secret-scanner','callscore-supervisor-verifier');

SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000026','resolved_prompt','/srv/agents/hermes/profiles/callscore/runtime/children/critic.prompt',repeat('6',64),100,'text/plain','callscore-critic-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000027','prompt_secret_scan_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/critic.scan',repeat('7',64),50,'application/json','callscore-secret-scanner','callscore-supervisor-verifier');
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM record_generation_provenance(
      '70900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',NULL,
      '50200000-0000-0000-0000-000000000001',NULL,
      'callscore-x-head','head-synthesizer','parent-session','x-head','wrong-unassigned-version',
      '40000000-0000-0000-0000-000000000020','40000000-0000-0000-0000-000000000021',
      'm','p','{}','{}',repeat('2',64),'{}',repeat('3',64),'{}','40000000-0000-0000-0000-000000000022','{}',0,
      clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'generation accepted a prompt/model/parameter definition outside producer assignment'; END IF;
END;
$$;
SELECT record_generation_provenance(
  '70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',NULL,
  '50200000-0000-0000-0000-000000000001',NULL,'callscore-x-head','head-synthesizer','parent-session','x-head','v1',
  '40000000-0000-0000-0000-000000000020','40000000-0000-0000-0000-000000000021','m','p','{}','{}',repeat('2',64),'{}',repeat('3',64),
  jsonb_build_object('50100000-0000-0000-0000-000000000001',repeat('2',64),'50100000-0000-0000-0000-000000000002',repeat('4',64)),
  '40000000-0000-0000-0000-000000000022','{}',0,
  clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second'
);
SELECT record_generation_provenance(
  '70000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
  NULL,NULL,'callscore-evaluator-child','analyst','session-probe-a','x-eval','v1','40000000-0000-0000-0000-000000000023','40000000-0000-0000-0000-000000000024',
  'm','p','{}','{}',repeat('8',64),'{}',repeat('9',64),'{}','40000000-0000-0000-0000-000000000002','{}',0,
  clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second'
);
SELECT record_generation_provenance(
  '70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',
  NULL,NULL,'callscore-critic-child','critic','session-probe-b','x-critic','v1','40000000-0000-0000-0000-000000000026','40000000-0000-0000-0000-000000000027',
  'm','p','{}','{}',repeat('a',64),'{}',repeat('b',64),'{}','40000000-0000-0000-0000-000000000004','{}',0,
  clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second'
);
SELECT (transition_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001','HEAD_SYNTHESIS','QUALITY_EVALUATION',5,
  '00000000-0000-0000-0000-000000000204','fixture_synthesis_complete'
)).state_version;
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000005','hermes_usage','/srv/agents/hermes/profiles/callscore/runtime/children/evaluator-post-head.usage',repeat('5',64),10,'application/json','callscore-evaluator-child','callscore-supervisor-verifier');
SELECT record_autonomy_artifact('40000000-0000-0000-0000-000000000025','child_output','/srv/agents/hermes/profiles/callscore/runtime/children/evaluator-post-head.out',repeat('5',64),20,'application/json','callscore-evaluator-child','callscore-supervisor-verifier');
SELECT create_agent_delegation('50000000-0000-0000-0000-000000000003','50100000-0000-0000-0000-000000000003',
  '51000000-0000-0000-0000-000000000003','/usr/bin/hermes',1000,'/opt/crypto-tuber-ranked',
  '/srv/agents/hermes/profiles/callscore/runtime/children/evaluator-post-head.usage','/srv/agents/hermes/profiles/callscore/runtime/children/evaluator-post-head.out',clock_timestamp()+interval '2 minutes');
SELECT assign_runtime_variant('00000000-0000-0000-0000-000000000001','callscore-evaluator-child','evaluator');
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000003','DISPATCH_INTENT',1,'SPAWNED',12347,12347,1001,'session-probe-evaluator',NULL,NULL,NULL,NULL,'{"source":"parent_procfs_after_head"}')).launch_status;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000003','SPAWNED',1,'SUCCEEDED',12347,12347,1001,'session-probe-evaluator','40000000-0000-0000-0000-000000000005',repeat('5',64),'40000000-0000-0000-0000-000000000025',repeat('5',64),'{"source":"parent_wait4_after_head"}')).launch_status;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000005',repeat('5',64),'child_process_identity','50000000-0000-0000-0000-000000000003',repeat('5',64),'hermes-child-process-identity.v1','callscore-supervisor-verifier','{"pid":12347,"pgid":12347,"start_ticks":1001,"session_id":"session-probe-evaluator","source":"parent_procfs_wait4"}');
SELECT record_verified_evidence_binding(gen_random_uuid(),'40000000-0000-0000-0000-000000000025',repeat('5',64),'child_output','50000000-0000-0000-0000-000000000003',repeat('5',64),'callscore.child_output.v1','callscore-supervisor-verifier','{"source":"post_head_output_schema_validator"}');
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (record_agent_delegation_event('50000000-0000-0000-0000-000000000003','SUCCEEDED',1,'ACCEPTED',12347,12347,1001,'session-probe-evaluator','40000000-0000-0000-0000-000000000005',repeat('5',64),'40000000-0000-0000-0000-000000000025',repeat('5',64),'{"source":"parent_verifier_after_head"}')).launch_status;
SELECT record_generation_provenance(
  '70000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003',
  NULL,'70000000-0000-0000-0000-000000000001','callscore-evaluator-child','evaluator','session-probe-evaluator','x-eval','v1',
  '40000000-0000-0000-0000-000000000023','40000000-0000-0000-0000-000000000024','m','p','{}','{}',repeat('8',64),'{}',repeat('9',64),
  jsonb_build_object('evaluated_generation_id','70000000-0000-0000-0000-000000000001','evaluated_output_sha256',repeat('2',64)),
  '40000000-0000-0000-0000-000000000025','{}',0,clock_timestamp(),clock_timestamp()
);
SELECT record_autonomy_artifact('72000000-0000-0000-0000-000000000001','quality_gate:claim_policy','/srv/agents/hermes/profiles/callscore/runtime/children/gate-claim.json',repeat('a',64),10,'application/json','callscore-policy-gate','callscore-quality-verifier');
SELECT record_autonomy_artifact('72000000-0000-0000-0000-000000000002','quality_gate:canonical_receipts','/srv/agents/hermes/profiles/callscore/runtime/children/gate-receipts.json',repeat('b',64),10,'application/json','callscore-receipt-gate','callscore-quality-verifier');
SELECT record_autonomy_artifact('72000000-0000-0000-0000-000000000003','quality_gate:secrets','/srv/agents/hermes/profiles/callscore/runtime/children/gate-secrets.json',repeat('c',64),10,'application/json','callscore-secrets-gate','callscore-quality-verifier');
SELECT record_autonomy_artifact('72000000-0000-0000-0000-000000000004','quality_gate:originality','/srv/agents/hermes/profiles/callscore/runtime/children/gate-originality.json',repeat('d',64),10,'application/json','callscore-originality-gate','callscore-quality-verifier');
SELECT record_autonomy_artifact('72000000-0000-0000-0000-000000000005','quality_gate:destination_fit','/srv/agents/hermes/profiles/callscore/runtime/children/gate-destination.json',repeat('e',64),10,'application/json','callscore-destination-gate','callscore-quality-verifier');
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),a.artifact_id,a.content_sha256,'generation_quality_gate',
  '70000000-0000-0000-0000-000000000001:'||split_part(a.artifact_kind,':',2),repeat('2',64),
  'quality-gate:'||split_part(a.artifact_kind,':',2)||'.v1','callscore-quality-verifier',
  jsonb_build_object('independent_verifier_role','callscore_plan_report_verifier')
)
FROM autonomy_artifacts a WHERE a.artifact_kind LIKE 'quality_gate:%' ORDER BY a.artifact_id;
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT record_quality_gate_evidence(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','claim_policy',true,(SELECT artifact_id FROM autonomy_artifacts WHERE artifact_kind='quality_gate:claim_policy'),'callscore-quality-verifier');
SELECT record_quality_gate_evidence(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','canonical_receipts',true,(SELECT artifact_id FROM autonomy_artifacts WHERE artifact_kind='quality_gate:canonical_receipts'),'callscore-quality-verifier');
SELECT record_quality_gate_evidence(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','secrets',true,(SELECT artifact_id FROM autonomy_artifacts WHERE artifact_kind='quality_gate:secrets'),'callscore-quality-verifier');
SELECT record_quality_gate_evidence(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','originality',true,(SELECT artifact_id FROM autonomy_artifacts WHERE artifact_kind='quality_gate:originality'),'callscore-quality-verifier');
SELECT record_quality_gate_evidence(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','destination_fit',true,(SELECT artifact_id FROM autonomy_artifacts WHERE artifact_kind='quality_gate:destination_fit'),'callscore-quality-verifier');
SELECT (record_quality_evaluation(
  '71000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004',
  '{"factual_accuracy":1,"evidence_support":1,"originality":1,"platform_fit":1,"clarity":1,"callscore_voice":1,"commercial_strength":1,"actionability":1,"handoff_readiness":1,"hook":1,"argument":1,"native_structure":1,"audience_relevance":1,"cta":1,"safety_compliance":1}',0.1,0.2,'fixture_all_pass'
)).decision;
SELECT (transition_autonomy_workflow(
  '00000000-0000-0000-0000-000000000001','QUALITY_EVALUATION','READY',6,
  '00000000-0000-0000-0000-000000000204','fixture_quality_accepted'
)).state_version;

SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000001','provider_payload','/srv/agents/hermes/profiles/callscore/runtime/children/provider-payload.json',repeat('1',64),100,'application/json','callscore-x-head','callscore-provider-reviewer');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000009','provider_payload','/srv/agents/hermes/profiles/callscore/runtime/children/provider-payload-revocation-probe.json',repeat('9',64),100,'application/json','callscore-x-head','callscore-provider-reviewer');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000002','provider_object_rollback_contract','/srv/agents/hermes/profiles/callscore/runtime/children/provider-rollback.json',repeat('2',64),100,'application/json','callscore-rollback-author','callscore-provider-reviewer');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000003','provider_execution_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/provider-execution.json',repeat('3',64),100,'application/json','callscore-provider-worker','callscore-provider-readback');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000004','provider_readback_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/provider-readback.json',repeat('4',64),100,'application/json','callscore-provider-readback','callscore-trust-reviewer');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000005','provider_absence_readback_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/provider-absence.json',repeat('5',64),100,'application/json','callscore-provider-readback','callscore-trust-reviewer');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000011','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-1.json',repeat('a',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000012','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-2.json',repeat('b',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000013','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-3.json',repeat('c',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000014','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-4.json',repeat('d',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000015','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-5.json',repeat('e',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000016','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-6.json',repeat('f',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000017','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-7.json',repeat('0',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('80000000-0000-0000-0000-000000000018','canonical_receipt','/srv/agents/hermes/profiles/callscore/runtime/children/receipt-8.json',repeat('9',64),10,'application/json','callscore-receipt-producer','callscore-receipt-verifier');
SELECT record_autonomy_artifact('81000000-0000-0000-0000-000000000001','canonical_policy_validation_receipt','/srv/agents/hermes/profiles/callscore/runtime/policy/x-owned-post.validation.json',repeat('8',64),100,'application/json','callscore-registry-validator','callscore-trust-reviewer');
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  '81100000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001',repeat('8',64),
  'canonical_policy_snapshot','x-owned-post',repeat('b',64),'gtm-agent-registry-policy.v1','callscore-trust-reviewer',
  '{"source":"registry_json_schema_and_policy_commit_review","readiness_status":"READY_PUBLIC_OWNED"}'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
SELECT record_canonical_policy_snapshot(
  '82000000-0000-0000-0000-000000000001','x-owned-post',repeat('a',40),repeat('b',64),'v1','x',repeat('c',64),
  'social','X_CREATE_POST','create',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',
  '{"action":"delete_external_object"}','81000000-0000-0000-0000-000000000001'
);
INSERT INTO canonical_receipt_evidence(receipt_evidence_id,workflow_id,sequence_no,receipt_schema,status,receipt_artifact_id,receipt_sha256,verifier_agent_id,verified_at,stale_at)
SELECT gen_random_uuid(),'00000000-0000-0000-0000-000000000001',x.ord,x.schema_name,'PASS',x.artifact_id,a.content_sha256,'callscore-receipt-verifier',clock_timestamp(),clock_timestamp()+interval '1 hour'
FROM (VALUES
  (1,'editorial_angle_receipt.v1','80000000-0000-0000-0000-000000000011'::uuid),
  (2,'platform_fit_receipt.v1','80000000-0000-0000-0000-000000000012'::uuid),
  (3,'visual_brief_receipt.v1','80000000-0000-0000-0000-000000000013'::uuid),
  (4,'visual_qa_receipt.v1','80000000-0000-0000-0000-000000000014'::uuid),
  (5,'copy_visual_coherence_receipt.v1','80000000-0000-0000-0000-000000000015'::uuid),
  (6,'same_shit_memory_receipt.v1','80000000-0000-0000-0000-000000000016'::uuid),
  (7,'callscore.task_router_receipt.v1','80000000-0000-0000-0000-000000000017'::uuid),
  (8,'callscore.tool_inheritance_receipt.v1','80000000-0000-0000-0000-000000000018'::uuid)
) AS x(ord,schema_name,artifact_id) JOIN autonomy_artifacts a ON a.artifact_id=x.artifact_id;

RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT create_provider_operation_intent(
  '83000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',repeat('c',64),'social',
  'X_CREATE_POST','create','80000000-0000-0000-0000-000000000001',false,false,
  '80000000-0000-0000-0000-000000000002',clock_timestamp()+interval '10 minutes'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),x.artifact_id,x.artifact_sha256,'canonical_operational_receipt',
  '00000000-0000-0000-0000-000000000001:'||x.schema_name,p.payload_sha256,x.schema_name,
  'callscore-receipt-verifier',jsonb_build_object('package','fixture_exact_payload','schema',x.schema_name)
)
FROM (VALUES
  ('editorial_angle_receipt.v1','80000000-0000-0000-0000-000000000011'::uuid,repeat('a',64)::char(64)),
  ('platform_fit_receipt.v1','80000000-0000-0000-0000-000000000012'::uuid,repeat('b',64)::char(64)),
  ('visual_brief_receipt.v1','80000000-0000-0000-0000-000000000013'::uuid,repeat('c',64)::char(64)),
  ('visual_qa_receipt.v1','80000000-0000-0000-0000-000000000014'::uuid,repeat('d',64)::char(64)),
  ('copy_visual_coherence_receipt.v1','80000000-0000-0000-0000-000000000015'::uuid,repeat('e',64)::char(64)),
  ('same_shit_memory_receipt.v1','80000000-0000-0000-0000-000000000016'::uuid,repeat('f',64)::char(64)),
  ('callscore.task_router_receipt.v1','80000000-0000-0000-0000-000000000017'::uuid,repeat('0',64)::char(64)),
  ('callscore.tool_inheritance_receipt.v1','80000000-0000-0000-0000-000000000018'::uuid,repeat('9',64)::char(64))
) x(schema_name,artifact_id,artifact_sha256)
CROSS JOIN (VALUES(repeat('1',64)::char(64)),(repeat('9',64)::char(64))) p(payload_sha256)
ORDER BY p.payload_sha256,x.schema_name;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'80000000-0000-0000-0000-000000000002',repeat('2',64),
  'provider_rollback_contract',v.intent_id::text,repeat('2',64),'provider-object-rollback-contract.v1',
  'callscore-provider-reviewer',jsonb_build_object('action','delete_external_object','intent_id',v.intent_id)
)
FROM (VALUES
  ('83000000-0000-0000-0000-000000000001'::uuid),
  ('83900000-0000-0000-0000-000000000001'::uuid)
) v(intent_id);
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
SELECT mint_ready_public_owned_grant('00000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001');
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
-- Negative probe: revocation after operation creation but before dispatch remains authoritative.
SELECT create_provider_operation_intent(
  '83900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',repeat('c',64),'social',
  'X_CREATE_POST','create','80000000-0000-0000-0000-000000000009',false,false,
  '80000000-0000-0000-0000-000000000002',clock_timestamp()+interval '10 minutes'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
SELECT mint_ready_public_owned_grant('00000000-0000-0000-0000-000000000001','83900000-0000-0000-0000-000000000001');
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','READY','EXECUTING',7,'00000000-0000-0000-0000-000000000204','fixture_execute')).state_version;
SELECT (create_provider_operation(
  '84000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001',
  (SELECT grant_id FROM external_action_grants WHERE intent_id='83000000-0000-0000-0000-000000000001'),'fixture-provider-worker','85000000-0000-0000-0000-000000000001'
)).provider_state;
SELECT (create_provider_operation(
  '84900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','83900000-0000-0000-0000-000000000001',
  (SELECT grant_id FROM external_action_grants WHERE intent_id='83900000-0000-0000-0000-000000000001'),'fixture-provider-worker','85900000-0000-0000-0000-000000000001'
)).provider_state;
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
SELECT revoke_external_action_grant(
  (SELECT grant_id FROM external_action_grants WHERE intent_id='83900000-0000-0000-0000-000000000001'),
  'fixture_revoked_before_dispatch'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM mark_provider_dispatching('84900000-0000-0000-0000-000000000001',0,'85900000-0000-0000-0000-000000000001');
  EXCEPTION WHEN SQLSTATE '40001' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'revoked grant still authorised provider dispatch'; END IF;
END;
$$;
SELECT (mark_provider_dispatching('84000000-0000-0000-0000-000000000001',0,'85000000-0000-0000-0000-000000000001')).provider_state;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'80000000-0000-0000-0000-000000000003',repeat('3',64),'provider_operation_evidence',
  '84000000-0000-0000-0000-000000000001:EXECUTION',
  encode(sha256(convert_to(jsonb_build_object(
    'operation_id','84000000-0000-0000-0000-000000000001'::uuid,'publication_revision',o.publication_revision,
    'account_scope_hash',o.account_scope_hash,'provider_tool',o.provider_tool,'action_name',o.action_name,
    'payload_sha256',o.payload_sha256,'evidence_type','EXECUTION','external_object_id','external-1',
    'external_url','https://x.example/external-1','visibility','public','performed',true
  )::text,'UTF8')),'hex'),'provider-execution-evidence.v1','callscore-provider-readback','{"source":"provider_execution_verifier"}'
) FROM provider_operations o WHERE o.operation_id='84000000-0000-0000-0000-000000000001';
SELECT record_provider_readback_evidence(
  '86000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','EXECUTION',
  clock_timestamp()-interval '5 seconds',clock_timestamp()+interval '5 seconds','external-1','https://x.example/external-1','public',true,
  '80000000-0000-0000-0000-000000000003','callscore-provider-readback'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (record_provider_result(
  '84000000-0000-0000-0000-000000000001',1,'85000000-0000-0000-0000-000000000001','SUBMITTED','fixture_submitted',repeat('3',64),
  'external-1','https://x.example/external-1','80000000-0000-0000-0000-000000000003'
)).provider_state;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'80000000-0000-0000-0000-000000000004',repeat('4',64),'provider_operation_evidence',
  '84000000-0000-0000-0000-000000000001:READBACK',
  encode(sha256(convert_to(jsonb_build_object(
    'operation_id','84000000-0000-0000-0000-000000000001'::uuid,'publication_revision',o.publication_revision,
    'account_scope_hash',o.account_scope_hash,'provider_tool',o.provider_tool,'action_name',o.action_name,
    'payload_sha256',o.payload_sha256,'evidence_type','READBACK','external_object_id','external-1',
    'external_url','https://x.example/external-1','visibility','public','performed',true
  )::text,'UTF8')),'hex'),'provider-readback-evidence.v1','callscore-trust-reviewer','{"source":"independent_public_readback"}'
) FROM provider_operations o WHERE o.operation_id='84000000-0000-0000-0000-000000000001';
SELECT record_provider_readback_evidence(
  '86000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000001','READBACK',
  clock_timestamp()-interval '5 seconds',clock_timestamp()+interval '5 seconds','external-1','https://x.example/external-1','public',true,
  '80000000-0000-0000-0000-000000000004','callscore-trust-reviewer'
);
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'80000000-0000-0000-0000-000000000004',repeat('4',64),
  'outcome_measurement','00000000-0000-0000-0000-000000000001:engagement_rate',repeat('4',64),
  'outcome-source.v1','callscore-trust-reviewer','{"collector":"independent_public_readback"}'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (record_provider_result(
  '84000000-0000-0000-0000-000000000001',2,'85000000-0000-0000-0000-000000000001','VERIFIED','fixture_verified',repeat('4',64),
  'external-1','https://x.example/external-1','80000000-0000-0000-0000-000000000004'
)).provider_state;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','EXECUTING','PROVIDER_VERIFIED',8,'00000000-0000-0000-0000-000000000204','fixture_provider_verified')).state_version;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','PROVIDER_VERIFIED','OUTCOME_PENDING',9,'00000000-0000-0000-0000-000000000204','fixture_outcome_pending')).state_version;
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM record_outcome_measurement(
      '87900000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001','engagement_rate',0.25,100,
      clock_timestamp()-interval '1 day',clock_timestamp(),'80000000-0000-0000-0000-000000000003',repeat('3',64),
      '{"source":"unbound_outcome_negative_probe"}'
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'outcome accepted an unbound source artifact'; END IF;
END;
$$;
SELECT record_outcome_measurement(
  '87000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001',
  'engagement_rate',0.25,100,clock_timestamp()-interval '1 day',clock_timestamp(),
  '80000000-0000-0000-0000-000000000004',repeat('4',64),'{"source":"fixture_readback"}'
);
CREATE TEMP TABLE fixture_learning_payloads(
  ordinal integer PRIMARY KEY,
  artifact_schema text NOT NULL,
  learning_artifact_id uuid NOT NULL,
  validation_artifact_id uuid NOT NULL,
  validation_sha256 char(64) NOT NULL,
  artifact_payload jsonb NOT NULL,
  artifact_payload_sha256 char(64)
) ON COMMIT DROP;

INSERT INTO fixture_learning_payloads(ordinal,artifact_schema,learning_artifact_id,validation_artifact_id,validation_sha256,artifact_payload)
SELECT row_number() OVER (),s,
  ('88000000-0000-0000-0000-00000000000'||row_number() OVER ())::uuid,
  ('89000000-0000-0000-0000-00000000000'||row_number() OVER ())::uuid,
  repeat((4+row_number() OVER ())::text,64)::char(64),
  jsonb_build_object(
      'schema',s,'workflow_id',g.workflow_id,'measurement_id',m.measurement_id,'generation_id',g.generation_id,
      'agent_id',g.producer_agent_id,'channel',g.channel,'prompt_name',g.prompt_name,'prompt_version',g.prompt_version,
      'prompt_sha256',g.prompt_sha256,'model',g.model,'provider',g.provider,'parameters',g.parameters,
      'experiment_id',g.experiment_id,'cohort_id',g.cohort_id,'variant_id',g.variant_id,
      'publication_id',m.publication_id,'source_artifact_id',m.source_artifact_id,'source_sha256',m.source_sha256,
      'registry_version',g.registry_version,'evaluator_weighted_score',q.weighted_score,'recorded_at',clock_timestamp()
    ) || CASE s
      WHEN 'learning_event.v1' THEN jsonb_build_object(
        'event_type','outcome_observation','metric_name',m.metric_name,'metric_value',m.metric_value,
        'attribution_contract',m.attribution_contract
      )
      WHEN 'agent_performance_ledger.v1' THEN jsonb_build_object(
        'period_started_at',m.window_started_at,'period_duration_seconds',GREATEST(1,extract(epoch FROM m.window_ended_at-m.window_started_at)::integer),
        'task_counts',jsonb_build_object('completed',1,'failed',0,'remaining',0),
        'quality_metrics',jsonb_build_object('weighted_score',q.weighted_score),
        'outcome_metrics',jsonb_build_object(m.metric_name,m.metric_value),'safety_violations',0
      )
      WHEN 'learning_delta.v1' THEN jsonb_build_object(
        'prior_variant_id','61000000-0000-0000-0000-000000000001','candidate_variant_id','61000000-0000-0000-0000-000000000002',
        'changes',jsonb_build_array(jsonb_build_object('field','prompt','before_sha256',repeat('1',64),'after_sha256',repeat('4',64),'controlled_reason_code','fixture_outcome_learning')),
        'evidence_artifact_ids',jsonb_build_array(m.source_artifact_id),'hypothesis','The treatment prompt improves the primary outcome.',
        'predicted_effect',0.10,'risk_class','LOW'
      )
      WHEN 'experiment_result.v1' THEN jsonb_build_object(
        'variant_ids',jsonb_build_array('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002'),
        'control_sample_size',0,'treatment_sample_size',1,'observation_days',1,'primary_metric',m.metric_name,
        'absolute_delta',0.0025,'relative_delta',0.10,
        'bootstrap_ci95',jsonb_build_object('lower',-0.10,'width',0.20,'resamples',10000,'seed',42),
        'safety_violations',0,'decision','CONTINUE'
      )
    END
FROM unnest(ARRAY['learning_event.v1','agent_performance_ledger.v1','learning_delta.v1','experiment_result.v1']) WITH ORDINALITY AS u(s,n)
CROSS JOIN generation_provenance g CROSS JOIN outcome_measurements m CROSS JOIN quality_evaluations q
WHERE g.generation_id='70000000-0000-0000-0000-000000000001'
  AND m.measurement_id='87000000-0000-0000-0000-000000000001'
  AND q.evaluation_id='71000000-0000-0000-0000-000000000001';
UPDATE fixture_learning_payloads
SET artifact_payload_sha256=encode(sha256(convert_to(artifact_payload::text,'UTF8')),'hex');

SELECT record_autonomy_artifact(
  learning_artifact_id,artifact_schema,
  '/srv/agents/hermes/profiles/callscore/runtime/children/'||ordinal||'-learning.json',
  artifact_payload_sha256,octet_length(artifact_payload::text),'application/json','callscore-learning-agent','callscore-learning-verifier'
)
FROM fixture_learning_payloads ORDER BY ordinal;
SELECT record_autonomy_artifact(
  validation_artifact_id,'json_schema_validation_receipt',
  '/srv/agents/hermes/profiles/callscore/runtime/children/'||ordinal||'-learning-validation.json',
  validation_sha256,100,'application/json','callscore-schema-validator','callscore-learning-verifier'
)
FROM fixture_learning_payloads ORDER BY ordinal;
GRANT SELECT ON fixture_learning_payloads TO callscore_plan_report_verifier;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),validation_artifact_id,validation_sha256,'canonical_learning_payload',
  artifact_schema||':'||learning_artifact_id::text,artifact_payload_sha256,'canonical-learning-artifacts.v4',
  'callscore-learning-verifier',jsonb_build_object('validator','jsonschema-draft-2020-12','ordinal',ordinal)
)
FROM fixture_learning_payloads ORDER BY ordinal;
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT record_canonical_learning_set(
  '00000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
  ARRAY(SELECT learning_artifact_id FROM fixture_learning_payloads ORDER BY ordinal),
  ARRAY(SELECT artifact_payload FROM fixture_learning_payloads ORDER BY ordinal),
  ARRAY(SELECT validation_artifact_id FROM fixture_learning_payloads ORDER BY ordinal)
);

-- Negative probe: an unrelated validation binding and altered payload hash must fail closed.
SELECT record_autonomy_artifact(
  '88100000-0000-0000-0000-000000000001','learning_event.v1',
  '/srv/agents/hermes/profiles/callscore/runtime/children/negative-learning.json',
  (SELECT encode(sha256(convert_to(jsonb_set(artifact_payload,'{metric_value}','999'::jsonb)::text,'UTF8')),'hex') FROM fixture_learning_payloads WHERE ordinal=1),100,'application/json',
  'callscore-learning-agent','callscore-learning-verifier'
);
SELECT record_autonomy_artifact(
  '89100000-0000-0000-0000-000000000001','json_schema_validation_receipt',
  '/srv/agents/hermes/profiles/callscore/runtime/children/negative-learning-validation.json',
  repeat('a',64),100,'application/json','callscore-schema-validator','callscore-learning-verifier'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'89100000-0000-0000-0000-000000000001',repeat('a',64),
  'canonical_learning_payload','learning_event.v1:88100000-0000-0000-0000-000000000001',repeat('0',64),
  'canonical-learning-artifacts.v4','callscore-learning-verifier','{"negative_probe":"unrelated_subject_hash"}'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
DO $$
DECLARE v_rejected boolean:=false; v_payloads jsonb[];
BEGIN
  SELECT ARRAY(SELECT artifact_payload FROM fixture_learning_payloads ORDER BY ordinal) INTO v_payloads;
  v_payloads[1]:=jsonb_set(v_payloads[1],'{metric_value}','999'::jsonb);
  BEGIN
    PERFORM record_canonical_learning_set(
      '00000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',
      ARRAY['88100000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000002','88000000-0000-0000-0000-000000000003','88000000-0000-0000-0000-000000000004']::uuid[],
      v_payloads,
      ARRAY['89100000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000002','89000000-0000-0000-0000-000000000003','89000000-0000-0000-0000-000000000004']::uuid[]
    );
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'altered learning payload/unrelated receipt accepted'; END IF;
END;
$$;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','OUTCOME_PENDING','OUTCOME_MEASURED',10,'00000000-0000-0000-0000-000000000204','fixture_outcome_measured')).state_version;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','OUTCOME_MEASURED','LEARNING_RECORDED',11,'00000000-0000-0000-0000-000000000204','fixture_learning_recorded')).state_version;
SELECT (transition_autonomy_workflow('00000000-0000-0000-0000-000000000001','LEARNING_RECORDED','COMPLETE',12,'00000000-0000-0000-0000-000000000204','fixture_complete')).state_version;

-- A concluded experiment may be followed by a new exact-reviewed experiment in the same agent stratum.
SELECT record_autonomy_artifact(
  '40000000-0000-0000-0000-000000000011','runtime_experiment_bundle_review_receipt',
  '/srv/agents/hermes/profiles/callscore/runtime/children/experiment-review-next.json',repeat('b',64),100,'application/json',
  'callscore-experiment-reviewer','callscore-trust-reviewer'
);
SELECT record_autonomy_artifact(
  '40000000-0000-0000-0000-000000000012','runtime_experiment_conclusion_receipt',
  '/srv/agents/hermes/profiles/callscore/runtime/children/experiment-conclusion.json',repeat('c',64),100,'application/json',
  'callscore-experiment-operator','callscore-trust-reviewer'
);
CREATE TEMP TABLE fixture_next_experiment_bundle AS
SELECT jsonb_build_object(
  'schema','callscore.runtime_experiment_bundle.v1','experiment_id','60000000-0000-0000-0000-000000000002',
  'agent_id','callscore-x-head','channel','x','task_type','x_owned_post','policy_version','policy-v1','primary_metric','engagement_rate',
  'eligibility_contract',jsonb_build_object('require_terminal_complete',true,'require_outcome',true,'require_accepted_quality',true),
  'bootstrap_contract',jsonb_build_object('method','percentile_bootstrap','statistic','relative_mean_delta','missing_data','exclude'),
  'bootstrap_resamples',10000,'bootstrap_seed',84,'minimum_control',30,'minimum_treatment',30,'minimum_observation_days',14,
  'treatment_ratio',20,'starts_at','2026-08-02T07:00:00Z',
  'control',jsonb_build_object('variant_id','61000000-0000-0000-0000-000000000003','cohort_id','62000000-0000-0000-0000-000000000003',
    'prompt_name','x-head','prompt_version','v3-control','prompt_sha256',repeat('7',64),'model','m','provider','p','parameters','{}'::jsonb,
    'tools_manifest_sha256',repeat('2',64),'skills_manifest_sha256',repeat('3',64),'created_from_variant_id','61000000-0000-0000-0000-000000000001'),
  'treatment',jsonb_build_object('variant_id','61000000-0000-0000-0000-000000000004','cohort_id','62000000-0000-0000-0000-000000000004',
    'prompt_name','x-head','prompt_version','v3-treatment','prompt_sha256',repeat('8',64),'model','m','provider','p','parameters','{}'::jsonb,
    'tools_manifest_sha256',repeat('5',64),'skills_manifest_sha256',repeat('6',64),'created_from_variant_id','61000000-0000-0000-0000-000000000003')
) AS bundle;
GRANT SELECT ON fixture_next_experiment_bundle TO callscore_plan_report_verifier,callscore_plan_policy_writer;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'40000000-0000-0000-0000-000000000012',repeat('c',64),
  'runtime_experiment_conclusion','60000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to(bundle::text,'UTF8')),'hex'),'runtime-experiment-conclusion.v1','callscore-trust-reviewer',
  '{"reason":"fixture_sequential_experiment"}'
) FROM fixture_experiment_bundle;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'40000000-0000-0000-0000-000000000011',repeat('b',64),
  'runtime_experiment_bundle','60000000-0000-0000-0000-000000000002',
  encode(sha256(convert_to(bundle::text,'UTF8')),'hex'),'runtime-experiment-bundle-review.v1','callscore-trust-reviewer',
  '{"review":"exact_sequential_bundle_digest"}'
) FROM fixture_next_experiment_bundle;
RESET ROLE;
SET LOCAL ROLE callscore_plan_policy_writer;
DO $$
DECLARE v_rejected boolean:=false; v_bundle jsonb:=(SELECT bundle FROM fixture_next_experiment_bundle);
BEGIN
  BEGIN
    PERFORM import_runtime_experiment_bundle(v_bundle,'40000000-0000-0000-0000-000000000011');
  EXCEPTION WHEN SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'overlapping same-stratum experiment unexpectedly imported'; END IF;
END;
$$;
SELECT conclude_runtime_experiment(
  '60000000-0000-0000-0000-000000000001',
  encode(sha256(convert_to(bundle::text,'UTF8')),'hex'),
  '40000000-0000-0000-0000-000000000012','fixture_sequential_experiment'
) FROM fixture_experiment_bundle;
SELECT import_runtime_experiment_bundle(bundle,'40000000-0000-0000-0000-000000000011')
FROM fixture_next_experiment_bundle;
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM runtime_registry
    WHERE agent_id='callscore-x-head' AND channel='x' AND task_type='x_owned_post' AND policy_version='policy-v1'
      AND active_variant_id='61000000-0000-0000-0000-000000000003' AND registry_version=2
  ) THEN RAISE EXCEPTION 'sequential same-stratum experiment registry advance failed'; END IF;
END;
$$;
SET LOCAL ROLE callscore_plan_runtime;
DO $$
DECLARE v_rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM create_agent_delegation(
      '50900000-0000-0000-0000-000000000002','50100000-0000-0000-0000-000000000003',
      '51900000-0000-0000-0000-000000000002','/usr/bin/hermes',1000,'/opt/crypto-tuber-ranked',
      '/srv/agents/hermes/profiles/callscore/runtime/children/post-terminal.usage','/srv/agents/hermes/profiles/callscore/runtime/children/post-terminal.out',
      clock_timestamp()+interval '2 minutes'
    );
  EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE '23514' THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'post-terminal child delegation unexpectedly accepted'; END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  BEGIN
    UPDATE channel_tasks SET status='running' WHERE id='01000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'legacy reactivation unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF (SELECT workflow_state FROM autonomy_workflows WHERE workflow_id='00000000-0000-0000-0000-000000000001')<>'COMPLETE'
     OR (SELECT count(*) FROM autonomy_workflow_lease_events WHERE workflow_id='00000000-0000-0000-0000-000000000001')<3
     OR (SELECT provider_state FROM provider_operations WHERE operation_id='84000000-0000-0000-0000-000000000001')<>'VERIFIED'
     OR (SELECT count(*) FROM canonical_learning_artifacts WHERE workflow_id='00000000-0000-0000-0000-000000000001')<>4 THEN
    RAISE EXCEPTION 'full owned-public executable lifecycle probe failed';
  END IF;
END;
$$;

-- Exercise the ambiguous-dispatch fail-closed path and explicit absence-confirmed reclaim.
INSERT INTO provider_operation_intents(
  intent_id,workflow_id,sequence_no,publication_revision,account_scope_hash,mutation_family,provider_tool,action_name,
  payload_artifact_id,payload_sha256,is_media,is_youtube,rollback_artifact_id,expires_at
) SELECT '83000000-0000-0000-0000-000000000002',workflow_id,3,publication_revision,account_scope_hash,mutation_family,
  provider_tool,'create_probe_unknown',payload_artifact_id,payload_sha256,is_media,is_youtube,rollback_artifact_id,clock_timestamp()+interval '10 minutes'
  FROM provider_operation_intents WHERE intent_id='83000000-0000-0000-0000-000000000001';
INSERT INTO external_action_grants(
  grant_id,workflow_id,intent_id,sequence_no,authority_source,policy_snapshot_id,account_scope_hash,mutation_family,
  provider_tool,action_name,publication_revision,payload_sha256,issued_by_role,issued_at,expires_at
) SELECT '83000000-0000-0000-0000-000000000003',workflow_id,'83000000-0000-0000-0000-000000000002',3,authority_source,
  policy_snapshot_id,account_scope_hash,mutation_family,provider_tool,'create_probe_unknown',publication_revision,payload_sha256,
  issued_by_role,clock_timestamp(),clock_timestamp()+interval '10 minutes'
  FROM external_action_grants WHERE intent_id='83000000-0000-0000-0000-000000000001';
INSERT INTO provider_operations(
  operation_id,workflow_id,generation_id,accepted_evaluation_id,intent_id,authority_grant_id,account_scope_hash,provider_tool,action_name,publication_revision,
  payload_sha256,idempotency_key,provider_state,state_version,lease_owner,lease_token,lease_generation,lease_expires_at
) SELECT '84000000-0000-0000-0000-000000000002',workflow_id,'70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002',
  '83000000-0000-0000-0000-000000000003',account_scope_hash,provider_tool,'create_probe_unknown',publication_revision,
  payload_sha256,repeat('8',64),'CLAIMED',0,'stale-worker','85000000-0000-0000-0000-000000000002',1,clock_timestamp()-interval '1 second'
  FROM provider_operation_intents WHERE intent_id='83000000-0000-0000-0000-000000000002';
INSERT INTO provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code)
VALUES(gen_random_uuid(),'84000000-0000-0000-0000-000000000002',1,'INTENT','CLAIMED','fixture_initial_claim');
INSERT INTO provider_operation_lease_events(
  lease_event_id,operation_id,sequence_no,lease_generation,prior_lease_owner,lease_owner,lease_token,lease_expires_at,controlled_reason_code
) VALUES (
  gen_random_uuid(),'84000000-0000-0000-0000-000000000002',1,1,NULL,'stale-worker',
  '85000000-0000-0000-0000-000000000002',clock_timestamp()-interval '1 second','fixture_initial_lease'
);
SET LOCAL ROLE callscore_plan_runtime;
SELECT (reclaim_provider_claim('84000000-0000-0000-0000-000000000002',0,'fixture-provider-reclaimer','85000000-0000-0000-0000-000000000003')).lease_generation;
SELECT (mark_provider_dispatching('84000000-0000-0000-0000-000000000002',0,'85000000-0000-0000-0000-000000000003')).provider_state;
RESET ROLE;
UPDATE provider_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE operation_id='84000000-0000-0000-0000-000000000002';
SET LOCAL ROLE callscore_plan_runtime;
SELECT (reconcile_ambiguous_provider_dispatch('84000000-0000-0000-0000-000000000002',1,'fixture_crash_after_dispatch')).provider_state;
RESET ROLE;
SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'80000000-0000-0000-0000-000000000005',repeat('5',64),'provider_operation_evidence',
  '84000000-0000-0000-0000-000000000002:ABSENCE',
  encode(sha256(convert_to(jsonb_build_object(
    'operation_id','84000000-0000-0000-0000-000000000002'::uuid,'publication_revision',o.publication_revision,
    'account_scope_hash',o.account_scope_hash,'provider_tool',o.provider_tool,'action_name',o.action_name,
    'payload_sha256',o.payload_sha256,'evidence_type','ABSENCE','external_object_id',NULL,
    'external_url',NULL,'visibility',NULL,'performed',false
  )::text,'UTF8')),'hex'),'provider-absence-evidence.v1','callscore-trust-reviewer','{"source":"independent_absence_readback"}'
) FROM provider_operations o WHERE o.operation_id='84000000-0000-0000-0000-000000000002';
SELECT record_provider_readback_evidence(
  '86000000-0000-0000-0000-000000000003','84000000-0000-0000-0000-000000000002','ABSENCE',
  clock_timestamp()-interval '5 seconds',clock_timestamp()+interval '5 seconds',NULL,NULL,NULL,false,
  '80000000-0000-0000-0000-000000000005','callscore-trust-reviewer'
);
RESET ROLE;
SET LOCAL ROLE callscore_plan_runtime;
SELECT (confirm_provider_not_performed('84000000-0000-0000-0000-000000000002',2,'80000000-0000-0000-0000-000000000005','fixture_absence_verified')).provider_state;
SELECT (reclaim_confirmed_not_performed('84000000-0000-0000-0000-000000000002',3,'fixture-provider-final','85000000-0000-0000-0000-000000000004')).provider_state;
RESET ROLE;

-- Expired holders cannot mutate workflow or provider state, and public readback requires a URL and visibility.
SET LOCAL ROLE callscore_plan_runtime;
SELECT (claim_autonomy_workflow(
  (SELECT workflow_id FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000002'),
  'fixture-expired-workflow-holder','00000000-0000-0000-0000-000000000299',0,30
)).state_version;
RESET ROLE;
UPDATE autonomy_workflows SET lease_expires_at=clock_timestamp()-interval '1 second'
 WHERE source_channel_task_id='01000000-0000-0000-0000-000000000002';
SET LOCAL ROLE callscore_plan_runtime;
DO $$
DECLARE v_workflow_id uuid:=(SELECT workflow_id FROM autonomy_workflows WHERE source_channel_task_id='01000000-0000-0000-0000-000000000002');
BEGIN
  BEGIN
    PERFORM transition_autonomy_workflow(
      v_workflow_id,'HEAD_PLANNING','CHILDREN_RUNNING',1,
      '00000000-0000-0000-0000-000000000299','expired_holder_must_fail'
    );
    RAISE EXCEPTION 'expired workflow lease transition unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE provider_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
 WHERE operation_id='84000000-0000-0000-0000-000000000002';
SET LOCAL ROLE callscore_plan_runtime;
DO $$
DECLARE v_version bigint:=(SELECT state_version FROM provider_operations WHERE operation_id='84000000-0000-0000-0000-000000000002');
BEGIN
  BEGIN
    PERFORM mark_provider_dispatching(
      '84000000-0000-0000-0000-000000000002',v_version,
      '85000000-0000-0000-0000-000000000004'
    );
    RAISE EXCEPTION 'expired provider lease dispatch unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
DO $$
BEGIN
  BEGIN
    PERFORM record_provider_readback_evidence(
      '86000000-0000-0000-0000-000000000099','84000000-0000-0000-0000-000000000001','READBACK',
      clock_timestamp()-interval '5 minutes',clock_timestamp()+interval '5 minutes',
      'external-1',NULL,NULL,true,'80000000-0000-0000-0000-000000000004','callscore-trust-reviewer'
    );
    RAISE EXCEPTION 'public readback without URL and visibility unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM record_provider_readback_evidence(
      '86000000-0000-0000-0000-000000000098','84000000-0000-0000-0000-000000000001','READBACK',
      clock_timestamp()-interval '5 minutes',clock_timestamp()+interval '5 minutes',
      'external-1','https://x.example/external-1',NULL,true,
      '80000000-0000-0000-0000-000000000004','callscore-trust-reviewer'
    );
    RAISE EXCEPTION 'public readback without visibility unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM record_provider_readback_evidence(
      '86000000-0000-0000-0000-000000000097','84000000-0000-0000-0000-000000000001','READBACK',
      clock_timestamp()-interval '5 minutes',clock_timestamp()+interval '5 minutes',
      'external-1','javascript:alert(1)','public',true,
      '80000000-0000-0000-0000-000000000004','callscore-trust-reviewer'
    );
    RAISE EXCEPTION 'non-HTTPS public readback unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Exact typed finalisation evidence: authenticated reviewer lineage, review subjects, and rollback relations.
SET LOCAL ROLE callscore_plan_runtime;
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000001','autonomy_implementation_report.v7','/srv/agents/hermes/profiles/callscore/runtime/children/final-report.json',repeat('1',64),100,'application/json','fixture-report-producer','fixture-report-verifier');
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000002','autonomy_report_verification_receipt.v3','/srv/agents/hermes/profiles/callscore/runtime/children/final-report-verification.json',repeat('2',64),100,'application/json','fixture-report-verification-producer','fixture-report-verifier');
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000003','provider_object_rollback_receipt.v2','/srv/agents/hermes/profiles/callscore/runtime/children/provider-object-rollback.json',repeat('3',64),100,'application/json','fixture-rollback-author','fixture-report-verifier');
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000004','runtime_variant_rollback_receipt.v2','/srv/agents/hermes/profiles/callscore/runtime/children/runtime-variant-rollback.json',repeat('4',64),100,'application/json','fixture-rollback-author','fixture-report-verifier');
SELECT record_autonomy_artifact(('98000000-0000-0000-0000-00000000000'||n)::uuid,'hermes_review_process_identity','/srv/agents/hermes/profiles/callscore/runtime/children/reviewer-'||n||'-identity.json',repeat(n::text,64),100,'application/json','callscore-hermes-gateway','callscore-review-identity-attestor') FROM generate_series(5,7) n;
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000008','autonomy_independent_review_receipt.v2','/srv/agents/hermes/profiles/callscore/runtime/children/reviewer-5-review.json',repeat('8',64),100,'application/json','fixture-reviewer-5','fixture-report-verifier');
SELECT record_autonomy_artifact('98000000-0000-0000-0000-000000000009','autonomy_independent_review_receipt.v2','/srv/agents/hermes/profiles/callscore/runtime/children/reviewer-6-review.json',repeat('9',64),100,'application/json','fixture-reviewer-6','fixture-report-verifier');
SELECT record_autonomy_artifact('98000000-0000-0000-0000-00000000000a','autonomy_independent_review_receipt.v2','/srv/agents/hermes/profiles/callscore/runtime/children/reviewer-7-review.json',repeat('a',64),100,'application/json','fixture-reviewer-7','fixture-report-verifier');
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'98000000-0000-0000-0000-000000000002',repeat('2',64),
  'autonomy_final_report','99000000-0000-0000-0000-000000000002',repeat('1',64),
  'final-report-verification.v2','fixture-report-verifier',jsonb_build_object(
    'status','PASS','report_schema_sha256',repeat('a',64),'evidence_schema_sha256',repeat('b',64),
    'deployment_manifest_sha256',repeat('c',64),'phase_manifest_index_sha256',repeat('d',64),
    'review_attestation_ledger_sha256',repeat('e',64),'verifier_script_sha256',repeat('f',64),
    'frozen_evidence_manifest_sha256',repeat('0',64),
    'canary_generation_id','70000000-0000-0000-0000-000000000001'::uuid,
    'canary_accepted_evaluation_id','71000000-0000-0000-0000-000000000001'::uuid,
    'final_review_execution_ids',to_jsonb(ARRAY[
      '97000000-0000-0000-0000-000000000005'::uuid,
      '97000000-0000-0000-0000-000000000006'::uuid,
      '97000000-0000-0000-0000-000000000007'::uuid
    ])
  )
);
SELECT record_verified_evidence_binding(gen_random_uuid(),'98000000-0000-0000-0000-000000000003',repeat('3',64),'provider_object_rollback','84000000-0000-0000-0000-000000000001',repeat('c',64),'provider-object-rollback.v2','fixture-report-verifier','{"report_stream_id":"fixture-report-stream","report_sequence_no":1}');
SELECT record_verified_evidence_binding(gen_random_uuid(),'98000000-0000-0000-0000-000000000004',repeat('4',64),'runtime_variant_rollback','fixture-report-stream:1',repeat('c',64),'runtime-variant-rollback.v2','fixture-report-verifier','{"exact_experiment_relation":true}');
SELECT record_verified_evidence_binding(gen_random_uuid(),('98000000-0000-0000-0000-00000000000'||n)::uuid,repeat(n::text,64),'review_execution_identity','97000000-0000-0000-0000-00000000000'||n::text,repeat('c',64),'review-execution-identity.v1','callscore-review-identity-attestor','{"source":"gateway_session_ledger"}') FROM generate_series(5,7) n;
SELECT record_verified_evidence_binding(gen_random_uuid(),('98000000-0000-0000-0000-00000000000'||n)::uuid,repeat(n::text,64),'autonomy_review','97000000-0000-0000-0000-00000000000'||(n-3)::text,repeat('c',64),'independent-review-receipt.v1','fixture-report-verifier','{"scope":"FINAL"}') FROM generate_series(8,9) n;
SELECT record_verified_evidence_binding(gen_random_uuid(),'98000000-0000-0000-0000-00000000000a',repeat('a',64),'autonomy_review','97000000-0000-0000-0000-000000000007',repeat('c',64),'independent-review-receipt.v1','fixture-report-verifier','{"scope":"FINAL"}');
RESET ROLE;

SET LOCAL ROLE callscore_plan_review_identity_attestor;
SELECT record_review_execution_attestation(('97000000-0000-0000-0000-00000000000'||n)::uuid,repeat('a',40),repeat('d',40),repeat('c',64),
  'FINAL','fixture-reviewer-'||n,'fixture-session-'||n,'fixture-batch',(n-5)::smallint,
  ('98000000-0000-0000-0000-00000000000'||n)::uuid,
  CASE n WHEN 5 THEN '98000000-0000-0000-0000-000000000008'::uuid WHEN 6 THEN '98000000-0000-0000-0000-000000000009'::uuid ELSE '98000000-0000-0000-0000-00000000000a'::uuid END,
  repeat('c',64),'PASS')
FROM generate_series(5,7) n;
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_autonomy_review_receipt('96000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000005','FINAL',repeat('c',64),'98000000-0000-0000-0000-000000000008',repeat('8',64),'fixture-report-verifier');
SELECT record_autonomy_review_receipt('96000000-0000-0000-0000-000000000002','97000000-0000-0000-0000-000000000006','FINAL',repeat('c',64),'98000000-0000-0000-0000-000000000009',repeat('9',64),'fixture-report-verifier');
SELECT record_autonomy_review_receipt('96000000-0000-0000-0000-000000000003','97000000-0000-0000-0000-000000000007','FINAL',repeat('c',64),'98000000-0000-0000-0000-00000000000a',repeat('a',64),'fixture-report-verifier');
SELECT record_verified_evidence_binding(
  gen_random_uuid(),'40900000-0000-0000-0000-000000000001',repeat('f',64),
  'activation_fence','unfence:2',repeat('c',64),'activation-approval.v2','callscore-activation-reviewer',
  '{"deployment_tuple":"fixture-final-exact-target"}'
);
RESET ROLE;

SET LOCAL ROLE callscore_plan_policy_writer;
SELECT set_activation_fence(true,1,'fixture_refence_before_exact_activation','callscore_plan_policy_writer','40900000-0000-0000-0000-000000000001',repeat('c',64));
SELECT set_activation_fence(false,2,'fixture_exact_activation','callscore_plan_policy_writer','40900000-0000-0000-0000-000000000001',repeat('c',64));
RESET ROLE;

-- Exercise the real promotion and rollback authorities with 30 exact eligible
-- observations in each cohort. Rows are cloned only to keep this fixture
-- compact; all runtime predicates recompute statistics from the relational
-- workflow/assignment/generation/evaluation/outcome chain.
CREATE TEMP TABLE fixture_runtime_event_ids(kind text PRIMARY KEY,event_id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT,INSERT ON fixture_runtime_event_ids TO callscore_plan_runtime,callscore_plan_report_verifier;
WITH template AS (
  SELECT w FROM autonomy_workflows w WHERE workflow_id='00000000-0000-0000-0000-000000000001'
)
INSERT INTO autonomy_workflows
SELECT (jsonb_populate_record(NULL::autonomy_workflows,
  to_jsonb(t.w)||jsonb_build_object(
    'workflow_id',md5('experiment-workflow-'||n)::uuid,
    'workflow_run_id',md5('experiment-run-'||n)::uuid,
    'source_channel_task_id',NULL,
    'execution_class','INTERNAL_ARTIFACT','workflow_state','COMPLETE','achievement_class','DRAFTED',
    'head_agent_id','fixture-experiment-head','channel','fixture','task_type','experiment_observation',
    'input_payload',jsonb_build_object('sample',n),
    'input_payload_sha256',encode(sha256(convert_to(jsonb_build_object('sample',n)::text,'UTF8')),'hex'),
    'state_version',1,'lease_owner',NULL,'lease_token',NULL,'lease_expires_at',NULL,
    'checkpoint_thread_id','callscore-task:'||md5('experiment-workflow-'||n)::uuid::text,
    'terminal_reason_code','fixture_exact_experiment_sample',
    'created_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '14 days' ELSE interval '1 minute' END,
    'updated_at',clock_timestamp()
  ))).* FROM template t CROSS JOIN generate_series(1,60) n;

WITH template AS (
  SELECT a FROM runtime_variant_assignments a WHERE experiment_id='60000000-0000-0000-0000-000000000001' LIMIT 1
)
INSERT INTO runtime_variant_assignments
SELECT (jsonb_populate_record(NULL::runtime_variant_assignments,
  to_jsonb(t.a)||jsonb_build_object(
    'assignment_id',md5('experiment-assignment-'||n)::uuid,
    'workflow_id',md5('experiment-workflow-'||n)::uuid,
    'producer_agent_id','fixture-experiment-producer-'||n,'delegated_role','candidate-producer',
    'experiment_id','60000000-0000-0000-0000-000000000002',
    'sequence_no',1,
    'cohort_id',CASE WHEN n<=30 THEN '62000000-0000-0000-0000-000000000003' ELSE '62000000-0000-0000-0000-000000000004' END,
    'cohort_name',CASE WHEN n<=30 THEN 'CONTROL' ELSE 'TREATMENT' END,
    'variant_id',CASE WHEN n<=30 THEN '61000000-0000-0000-0000-000000000003' ELSE '61000000-0000-0000-0000-000000000004' END,
    'assignment_bucket',CASE WHEN n<=30 THEN 0 ELSE 90 END,
    'assignment_ratio_control',80,'monitoring_promotion_event_id',NULL,'registry_version',2,
    'previous_record_hash',NULL,'record_hash',NULL
  ))).* FROM template t CROSS JOIN generate_series(1,60) n;

WITH template AS (
  SELECT g FROM generation_provenance g WHERE generation_id='70000000-0000-0000-0000-000000000001'
)
INSERT INTO generation_provenance
SELECT (jsonb_populate_record(NULL::generation_provenance,
  to_jsonb(t.g)||jsonb_build_object(
    'generation_id',md5('experiment-generation-'||n)::uuid,
    'workflow_id',md5('experiment-workflow-'||n)::uuid,
    'workflow_run_id',md5('experiment-run-'||n)::uuid,'sequence_no',1,
    'delegation_id',NULL,'join_manifest_id',NULL,'evaluated_generation_id',NULL,
    'producer_agent_id','fixture-experiment-producer-'||n,'delegated_role','candidate-producer',
    'channel','fixture','task_type','experiment_observation','hermes_session_id','fixture-experiment-session-'||n,
    'registry_version',2,'experiment_id','60000000-0000-0000-0000-000000000002',
    'cohort_id',CASE WHEN n<=30 THEN '62000000-0000-0000-0000-000000000003' ELSE '62000000-0000-0000-0000-000000000004' END,
    'variant_id',CASE WHEN n<=30 THEN '61000000-0000-0000-0000-000000000003' ELSE '61000000-0000-0000-0000-000000000004' END,
    'started_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '14 days' ELSE interval '1 minute' END,
    'finished_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '14 days' ELSE interval '1 minute' END,
    'previous_record_hash',NULL,'record_hash',NULL
  ))).* FROM template t CROSS JOIN generate_series(1,60) n;

-- Independent evaluator and trust generations for the treatment candidate.
WITH template AS (
  SELECT g FROM generation_provenance g WHERE generation_id='70000000-0000-0000-0000-000000000004'
), reviewers(generation_id,workflow_no,producer_agent_id,delegated_role,hermes_session_id) AS (
  VALUES
    (md5('experiment-evaluator-generation')::uuid,29,'fixture-independent-evaluator','evaluator','fixture-independent-evaluator-session'),
    (md5('experiment-trust-generation')::uuid,30,'fixture-independent-trust','trust-reviewer','fixture-independent-trust-session')
)
INSERT INTO generation_provenance
SELECT (jsonb_populate_record(NULL::generation_provenance,
  to_jsonb(t.g)||jsonb_build_object(
    'generation_id',r.generation_id,'workflow_id',md5('experiment-workflow-'||r.workflow_no)::uuid,
    'workflow_run_id',md5('experiment-run-'||r.workflow_no)::uuid,'sequence_no',2,
    'producer_agent_id',r.producer_agent_id,'delegated_role',r.delegated_role,
    'hermes_session_id',r.hermes_session_id,'evaluated_generation_id',md5('experiment-generation-31')::uuid,
    'experiment_id','60000000-0000-0000-0000-000000000002',
    'cohort_id','62000000-0000-0000-0000-000000000004',
    'variant_id','61000000-0000-0000-0000-000000000004',
    'previous_record_hash',NULL,'record_hash',NULL,'created_at',clock_timestamp()
  ))).* FROM template t CROSS JOIN reviewers r;

WITH template AS (
  SELECT q FROM quality_evaluations q WHERE evaluation_id='71000000-0000-0000-0000-000000000001'
)
INSERT INTO quality_evaluations
SELECT (jsonb_populate_record(NULL::quality_evaluations,
  to_jsonb(t.q)||jsonb_build_object(
    'evaluation_id',md5('experiment-quality-'||n)::uuid,
    'workflow_id',md5('experiment-workflow-'||n)::uuid,'sequence_no',1,
    'generation_id',md5('experiment-generation-'||n)::uuid,
    'evaluator_generation_id',md5('experiment-evaluator-generation')::uuid,
    'weighted_score',CASE WHEN n<=30 THEN 0.80 ELSE 0.90 END,
    'previous_record_hash',NULL,'record_hash',NULL,
    'created_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '14 days' ELSE interval '1 minute' END
  ))).* FROM template t CROSS JOIN generate_series(1,60) n;

-- A separate trust evaluation causally authorises the treatment candidate used by promotion.
WITH template AS (
  SELECT q FROM quality_evaluations q WHERE evaluation_id='71000000-0000-0000-0000-000000000001'
)
INSERT INTO quality_evaluations
SELECT (jsonb_populate_record(NULL::quality_evaluations,
  to_jsonb(t.q)||jsonb_build_object(
    'evaluation_id',md5('experiment-trust-quality-31')::uuid,
    'workflow_id',md5('experiment-workflow-31')::uuid,'sequence_no',2,
    'generation_id',md5('experiment-generation-31')::uuid,
    'evaluator_generation_id',md5('experiment-trust-generation')::uuid,
    'weighted_score',0.90,'previous_record_hash',NULL,'record_hash',NULL,'created_at',clock_timestamp()
  ))).* FROM template t;

WITH template AS (
  SELECT m FROM outcome_measurements m WHERE measurement_id='87000000-0000-0000-0000-000000000001'
)
INSERT INTO outcome_measurements
SELECT (jsonb_populate_record(NULL::outcome_measurements,
  to_jsonb(t.m)||jsonb_build_object(
    'measurement_id',md5('experiment-measurement-'||n)::uuid,
    'workflow_id',md5('experiment-workflow-'||n)::uuid,'sequence_no',1,
    'generation_id',md5('experiment-generation-'||n)::uuid,
    'operation_id',NULL,'publication_id',NULL,'experiment_id','60000000-0000-0000-0000-000000000002',
    'cohort_id',CASE WHEN n<=30 THEN '62000000-0000-0000-0000-000000000003' ELSE '62000000-0000-0000-0000-000000000004' END,
    'variant_id',CASE WHEN n<=30 THEN '61000000-0000-0000-0000-000000000003' ELSE '61000000-0000-0000-0000-000000000004' END,
    'numerator',CASE WHEN n<=30 THEN 1.0 ELSE 1.2 END,'denominator',1.0,
    'metric_value',CASE WHEN n<=30 THEN 1.0 ELSE 1.2 END,
    'window_started_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '16 days' ELSE interval '1 day' END,
    'window_ended_at',clock_timestamp()-CASE WHEN n<=30 THEN interval '15 days' ELSE interval '1 minute' END,
    'measured_at',clock_timestamp(),'previous_record_hash',NULL,'record_hash',NULL
  ))).* FROM template t CROSS JOIN generate_series(1,60) n;

SELECT jsonb_build_object(
  'registry',(SELECT to_jsonb(r) FROM runtime_registry r JOIN runtime_experiments e USING(agent_id,channel,task_type,policy_version) WHERE e.experiment_id='60000000-0000-0000-0000-000000000002'),
  'experiment',(SELECT to_jsonb(e) FROM runtime_experiments e WHERE experiment_id='60000000-0000-0000-0000-000000000002'),
  'statistics',(SELECT to_jsonb(s) FROM compute_runtime_experiment_statistics('60000000-0000-0000-0000-000000000002') s),
  'evaluator',(SELECT jsonb_build_object('role',delegated_role,'producer',producer_agent_id,'session',hermes_session_id) FROM generation_provenance WHERE generation_id=md5('experiment-evaluator-generation')::uuid),
  'trust',(SELECT jsonb_build_object('role',delegated_role,'producer',producer_agent_id,'session',hermes_session_id) FROM generation_provenance WHERE generation_id=md5('experiment-trust-generation')::uuid),
  'eval_accept',(SELECT count(*) FROM quality_evaluations WHERE evaluator_generation_id=md5('experiment-evaluator-generation')::uuid AND decision='ACCEPT'),
  'trust_accept',(SELECT count(*) FROM quality_evaluations WHERE evaluator_generation_id=md5('experiment-trust-generation')::uuid AND decision='ACCEPT')
) AS promotion_positive_path_preconditions;

SET LOCAL ROLE callscore_plan_runtime;
INSERT INTO fixture_runtime_event_ids
SELECT 'PROMOTE',promote_runtime_variant(
  '60000000-0000-0000-0000-000000000002',2,
  md5('experiment-evaluator-generation')::uuid,md5('experiment-trust-generation')::uuid
);
RESET ROLE;

-- New post-promotion evaluations make the treatment quality regress; the
-- automatic rollback function must restore control and emit the typed event.
WITH template AS (
  SELECT q FROM quality_evaluations q WHERE evaluation_id='71000000-0000-0000-0000-000000000001'
)
INSERT INTO quality_evaluations
SELECT (jsonb_populate_record(NULL::quality_evaluations,
  to_jsonb(t.q)||jsonb_build_object(
    'evaluation_id',md5('experiment-regression-quality-'||n)::uuid,
    'workflow_id',md5('experiment-workflow-'||n)::uuid,'sequence_no',CASE WHEN n=31 THEN 3 ELSE 2 END,
    'generation_id',md5('experiment-generation-'||n)::uuid,
    'evaluator_generation_id','70000000-0000-0000-0000-000000000004',
    'weighted_score',0.10,'previous_record_hash',NULL,'record_hash',NULL,'created_at',clock_timestamp()+interval '1 second'
  ))).* FROM template t CROSS JOIN generate_series(31,60) n;

SET LOCAL ROLE callscore_plan_runtime;
INSERT INTO fixture_runtime_event_ids
SELECT 'ROLLBACK',rollback_runtime_variant(
  '60000000-0000-0000-0000-000000000002',3,md5('experiment-measurement-31')::uuid
);
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
SELECT record_provider_object_rollback_receipt('94000000-0000-0000-0000-000000000001','fixture-report-stream',1,repeat('c',64),'00000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000003',clock_timestamp(),clock_timestamp()+interval '1 hour');
SELECT record_runtime_variant_rollback_receipt('94000000-0000-0000-0000-000000000002','fixture-report-stream',1,repeat('c',64),
  '60000000-0000-0000-0000-000000000002',md5('experiment-measurement-31')::uuid,
  '61000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000000003',
  (SELECT event_id FROM fixture_runtime_event_ids WHERE kind='PROMOTE'),
  (SELECT event_id FROM fixture_runtime_event_ids WHERE kind='ROLLBACK'),
  '98000000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp()+interval '1 hour');
SELECT insert_verified_autonomy_report(
  '99000000-0000-0000-0000-000000000002','fixture-report-stream',1,
  repeat('a',40),repeat('b',40),repeat('d',40),repeat('e',64),repeat('f',64),repeat('0',64),
  'sha256:'||repeat('1',64),repeat('2',64),repeat('c',64),
  repeat('a',64),repeat('b',64),repeat('d',64),repeat('e',64),repeat('f',64),repeat('0',64),
  '98000000-0000-0000-0000-000000000001',repeat('1',64),'fixture-report-producer','fixture-report-verifier',
  '98000000-0000-0000-0000-000000000002',repeat('2',64),true,'[]',
  '84000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',
  ARRAY['97000000-0000-0000-0000-000000000005'::uuid,'97000000-0000-0000-0000-000000000006'::uuid,'97000000-0000-0000-0000-000000000007'::uuid],
  '80000000-0000-0000-0000-000000000004',
  '98000000-0000-0000-0000-000000000003','98000000-0000-0000-0000-000000000004',
  '94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002'
);
DO $$
BEGIN
  BEGIN
    PERFORM record_provider_object_rollback_receipt('94900000-0000-0000-0000-000000000001','fixture-report-stream',3,repeat('c',64),'00000000-0000-0000-0000-000000000001','84000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000003',clock_timestamp(),clock_timestamp()+interval '1 hour');
    RAISE EXCEPTION 'stale report sequence reused provider rollback evidence';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM record_runtime_variant_rollback_receipt(
      '94900000-0000-0000-0000-000000000002','fixture-report-stream',3,repeat('c',64),
      '60000000-0000-0000-0000-000000000002',md5('experiment-measurement-31')::uuid,
      '61000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000000003',
      (SELECT event_id FROM fixture_runtime_event_ids WHERE kind='PROMOTE'),
      (SELECT event_id FROM fixture_runtime_event_ids WHERE kind='ROLLBACK'),
      '98000000-0000-0000-0000-000000000004',clock_timestamp(),clock_timestamp()+interval '1 hour'
    );
    RAISE EXCEPTION 'stale report sequence reused runtime rollback evidence';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$$;

-- High-risk authority functions must be runtime-callable and fail closed on insufficient evidence.
SET LOCAL ROLE callscore_plan_runtime;
DO $$
BEGIN
  BEGIN
    PERFORM record_artifact_revision(
      '90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000002','["fixture_negative_revision"]'
    );
    RAISE EXCEPTION 'invalid revision unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' OR SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM promote_runtime_variant(
      '60000000-0000-0000-0000-000000000001',1,
      '70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002'
    );
    RAISE EXCEPTION 'underpowered/self-reviewed promotion unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
  BEGIN
    PERFORM rollback_runtime_variant(
      '60000000-0000-0000-0000-000000000001',1,'87000000-0000-0000-0000-000000000001'
    );
    RAISE EXCEPTION 'rollback without prior promotion unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE callscore_plan_report_verifier;
DO $$
BEGIN
  BEGIN
    PERFORM insert_verified_autonomy_report(
      '99000000-0000-0000-0000-000000000001','fixture-report-stream',1,
      repeat('a',40),repeat('b',40),repeat('d',40),repeat('e',64),repeat('f',64),repeat('0',64),
      'sha256:'||repeat('1',64),repeat('2',64),repeat('c',64),
      repeat('a',64),repeat('b',64),repeat('d',64),repeat('e',64),repeat('f',64),repeat('0',64),
      '88000000-0000-0000-0000-000000000001',repeat('1',64),'fixture-report-producer','fixture-report-verifier',
      '88000000-0000-0000-0000-000000000002',repeat('2',64),true,'[]',
      '84000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001',
      ARRAY['97000000-0000-0000-0000-000000000005'::uuid,'97000000-0000-0000-0000-000000000006'::uuid,'97000000-0000-0000-0000-000000000007'::uuid],
      '80000000-0000-0000-0000-000000000004',
      '80000000-0000-0000-0000-000000000005','88000000-0000-0000-0000-000000000004',
      '94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000002'
    );
    RAISE EXCEPTION 'generic artifacts unexpectedly satisfied final PASS';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Execute the statistics function even for an empty experiment ID so PostgreSQL validates its return contract.
SET LOCAL ROLE callscore_plan_runtime;
SELECT count(*) AS empty_statistics_rows
FROM compute_runtime_experiment_statistics('30000000-0000-0000-0000-000000000001');
RESET ROLE;

DO $$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM canonical_learning_artifacts
    WHERE NOT (artifact_payload ? 'recorded_at')
       OR (artifact_schema='learning_event.v1' AND NOT (artifact_payload ?& ARRAY['event_type','metric_name','metric_value','attribution_contract']))
       OR (artifact_schema='agent_performance_ledger.v1' AND NOT (artifact_payload ?& ARRAY['period_started_at','period_duration_seconds','task_counts','quality_metrics','outcome_metrics','safety_violations']))
       OR (artifact_schema='learning_delta.v1' AND NOT (artifact_payload ?& ARRAY['prior_variant_id','candidate_variant_id','changes','evidence_artifact_ids','hypothesis','predicted_effect','risk_class']))
       OR (artifact_schema='experiment_result.v1' AND NOT (artifact_payload ?& ARRAY['variant_ids','control_sample_size','treatment_sample_size','observation_days','primary_metric','absolute_delta','relative_delta','bootstrap_ci95','safety_violations','decision']))
  ) THEN
    RAISE EXCEPTION 'canonical learning payload incompatible with declared schema';
  END IF;
END;
$$;

SELECT 'autonomy_contract_v8_passed' AS result;
ROLLBACK;
