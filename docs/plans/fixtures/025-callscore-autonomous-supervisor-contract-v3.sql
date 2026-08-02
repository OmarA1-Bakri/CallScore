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

CREATE TABLE autonomy_activation_fence (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fenced boolean NOT NULL DEFAULT true,
  fence_version bigint NOT NULL DEFAULT 0 CHECK (fence_version >= 0),
  controlled_reason_code text NOT NULL,
  updated_by_role text NOT NULL,
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

CREATE TABLE canonical_policy_snapshots (
  policy_snapshot_id uuid PRIMARY KEY,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  policy_record_id text NOT NULL,
  policy_commit_sha char(40) NOT NULL CHECK (policy_commit_sha ~ '^[0-9a-f]{40}$'),
  channel text NOT NULL,
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  readiness_status text NOT NULL CHECK (readiness_status='READY_PUBLIC_OWNED'),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL CHECK (valid_until > valid_from),
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

CREATE TABLE agent_delegations (
  delegation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  workflow_run_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  delegated_role text NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  canonical_child_agent_id text NOT NULL,
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
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (agent_id,channel,task_type,policy_version,primary_metric,starts_at),
  UNIQUE (experiment_id,agent_id,channel,task_type,policy_version)
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
  workflow_id uuid NOT NULL UNIQUE REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  experiment_id uuid REFERENCES runtime_experiments(experiment_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no=1),
  cohort_id uuid REFERENCES runtime_cohorts(cohort_id) ON DELETE RESTRICT,
  cohort_name text CHECK (cohort_name IN ('CONTROL','TREATMENT')),
  variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  assignment_bucket smallint CHECK (assignment_bucket BETWEEN 0 AND 99),
  assignment_ratio_control smallint CHECK (assignment_ratio_control=80),
  registry_version bigint NOT NULL CHECK (registry_version >= 0),
  previous_record_hash bytea,
  record_hash bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
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
  registry_version text NOT NULL,
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

CREATE TABLE autonomy_final_reports (
  report_id uuid PRIMARY KEY,
  report_stream_id text NOT NULL,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  report_schema text NOT NULL CHECK (report_schema='callscore.autonomy_implementation_report.v2'),
  app_commit_sha char(40) NOT NULL CHECK (app_commit_sha ~ '^[0-9a-f]{40}$'),
  workplane_commit_sha char(40) NOT NULL CHECK (workplane_commit_sha ~ '^[0-9a-f]{40}$'),
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
  canary_rollback_artifact_id uuid REFERENCES autonomy_artifacts(artifact_id) ON DELETE RESTRICT,
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
     AND canary_readback_artifact_id IS NOT NULL AND canary_rollback_artifact_id IS NOT NULL)
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
    ARRAY['canonical_policy_snapshots','policy_record_id','sequence_no'],
    ARRAY['canonical_receipt_evidence','workflow_id','sequence_no'],
    ARRAY['provider_operation_intents','workflow_id','sequence_no'],
    ARRAY['external_action_grants','workflow_id','sequence_no'],
    ARRAY['external_action_grant_revocations','grant_id','sequence_no'],
    ARRAY['agent_delegation_events','delegation_id','sequence_no'],
    ARRAY['runtime_variant_assignments','workflow_id','sequence_no'],
    ARRAY['generation_provenance','workflow_id','sequence_no'],
    ARRAY['quality_evaluations','workflow_id','sequence_no'],
    ARRAY['artifact_revisions','workflow_id','sequence_no'],
    ARRAY['provider_operation_events','operation_id','sequence_no'],
    ARRAY['provider_operation_lease_events','operation_id','sequence_no'],
    ARRAY['outcome_measurements','workflow_id','sequence_no'],
    ARRAY['canonical_learning_artifacts','workflow_id','sequence_no'],
    ARRAY['runtime_variant_cooldowns','variant_id','sequence_no'],
    ARRAY['runtime_promotion_events','experiment_id','sequence_no'],
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
    id,agent_id,channel_id,task_type,status,idempotency_key,payload_hash,payload
  ) VALUES (p_source_channel_task_id,p_head_agent_id,p_channel,p_task_type,'pending',p_channel_task_idempotency_key,p_input_payload_sha256,p_input_payload)
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

CREATE FUNCTION set_activation_fence(
  p_fenced boolean,
  p_expected_version bigint,
  p_reason text,
  p_actor text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_version bigint;
BEGIN
  UPDATE callscore_plan_contract.autonomy_activation_fence
  SET fenced=p_fenced,fence_version=fence_version+1,controlled_reason_code=p_reason,updated_by_role=p_actor,updated_at=clock_timestamp()
  WHERE singleton=true AND fence_version=p_expected_version
  RETURNING fence_version INTO v_version;
  IF v_version IS NULL THEN RAISE EXCEPTION 'activation fence CAS failed' USING ERRCODE='40001'; END IF;
  RETURN v_version;
END;
$$;

CREATE FUNCTION create_agent_delegation(
  p_delegation_id uuid,p_workflow_id uuid,p_revision_number integer,p_delegated_role text,p_ordinal smallint,
  p_child_agent_id text,p_usage_path text,p_stdout_path text,p_prompt_sha256 char(64),p_model text,p_provider text,
  p_allowed_capabilities jsonb,p_required_output_schema text,p_deadline_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows;
BEGIN
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_w.workflow_state NOT IN ('HEAD_PLANNING','CHILDREN_RUNNING') OR p_revision_number<>v_w.revision_count
     OR p_usage_path NOT LIKE '/srv/agents/hermes/profiles/callscore/runtime/children/%'
     OR p_stdout_path NOT LIKE '/srv/agents/hermes/profiles/callscore/runtime/children/%'
     OR p_deadline_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'delegation intent predicate failed' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.agent_delegations(
    delegation_id,workflow_id,workflow_run_id,revision_number,delegated_role,ordinal,canonical_child_agent_id,
    launch_status,usage_file_path,stdout_file_path,prompt_sha256,model,provider,allowed_capabilities,
    required_output_schema,lease_generation,deadline_at
  ) VALUES (p_delegation_id,p_workflow_id,v_w.workflow_run_id,p_revision_number,p_delegated_role,p_ordinal,p_child_agent_id,
    'DISPATCH_INTENT',p_usage_path,p_stdout_path,p_prompt_sha256,p_model,p_provider,p_allowed_capabilities,
    p_required_output_schema,1,p_deadline_at);
  INSERT INTO callscore_plan_contract.agent_delegation_events(event_id,delegation_id,sequence_no,status,lease_generation,detail)
  VALUES(gen_random_uuid(),p_delegation_id,1,'DISPATCH_INTENT',1,'{"reason":"dispatch_intent_committed"}');
  RETURN p_delegation_id;
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
  UPDATE callscore_plan_contract.agent_delegations
  SET launch_status=p_to_status,hermes_pid=COALESCE(p_hermes_pid,hermes_pid),hermes_pgid=COALESCE(p_hermes_pgid,hermes_pgid),
      hermes_start_ticks=COALESCE(p_start_ticks,hermes_start_ticks),hermes_session_id=COALESCE(p_session_id,hermes_session_id),
      lease_generation=CASE WHEN p_expected_status='ORPHANED' AND p_to_status='DISPATCH_INTENT' THEN lease_generation+1 ELSE lease_generation END
  WHERE delegation_id=p_delegation_id RETURNING * INTO v_d;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.agent_delegation_events WHERE delegation_id=p_delegation_id;
  INSERT INTO callscore_plan_contract.agent_delegation_events(
    event_id,delegation_id,sequence_no,status,lease_generation,hermes_pid,hermes_pgid,hermes_start_ticks,
    hermes_session_id,usage_artifact_id,usage_sha256,output_artifact_id,output_sha256,detail
  ) VALUES (gen_random_uuid(),p_delegation_id,v_seq,p_to_status,v_d.lease_generation,p_hermes_pid,p_hermes_pgid,p_start_ticks,
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
  IF v_current.workflow_state<>p_from OR v_current.state_version<>p_expected_version OR v_current.lease_token<>p_lease_token THEN
    RAISE EXCEPTION 'transition CAS/lease mismatch' USING ERRCODE='40001';
  END IF;
  IF NOT callscore_plan_contract.transition_is_allowed(v_current.execution_class,p_from,p_to) THEN
    RAISE EXCEPTION 'transition not allowed' USING ERRCODE='23514';
  END IF;
  IF p_to='REVISION' AND v_current.revision_count>=3 THEN
    RAISE EXCEPTION 'revision budget exhausted' USING ERRCODE='23514';
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
    NOT EXISTS(SELECT 1 FROM callscore_plan_contract.agent_delegations d WHERE d.workflow_id=p_workflow_id AND d.revision_number=v_current.revision_count)
    OR EXISTS(SELECT 1 FROM callscore_plan_contract.agent_delegations d WHERE d.workflow_id=p_workflow_id AND d.revision_number=v_current.revision_count AND d.launch_status<>'ACCEPTED')
  ) THEN RAISE EXCEPTION 'synthesis requires every required child ACCEPTED' USING ERRCODE='23514'; END IF;
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
    AND workflow_state NOT IN ('COMPLETE','FAILED')
  RETURNING * INTO v_row;
  IF v_row.workflow_id IS NULL THEN RAISE EXCEPTION 'heartbeat CAS/lease mismatch' USING ERRCODE='40001'; END IF;
  RETURN v_row;
END;
$$;

CREATE FUNCTION mint_ready_public_owned_grant(p_workflow_id uuid,p_intent_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_i callscore_plan_contract.provider_operation_intents;
        v_policy callscore_plan_contract.canonical_policy_snapshots; v_grant uuid:=gen_random_uuid(); v_required text[]; v_schema text;
BEGIN
  IF (SELECT fenced FROM callscore_plan_contract.autonomy_activation_fence WHERE singleton=true) THEN RAISE EXCEPTION 'activation fenced'; END IF;
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_i FROM callscore_plan_contract.provider_operation_intents WHERE intent_id=p_intent_id AND workflow_id=p_workflow_id;
  IF v_w.workflow_state<>'READY' OR v_w.execution_class<>'OWNED_PUBLIC_MUTATION' OR v_i.intent_id IS NULL OR v_i.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'workflow/intent not grant eligible' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_policy FROM callscore_plan_contract.canonical_policy_snapshots
   WHERE channel=v_w.channel AND account_scope_hash=v_i.account_scope_hash AND provider_tool=v_i.provider_tool
     AND action_name=v_i.action_name AND readiness_status='READY_PUBLIC_OWNED'
     AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()
   ORDER BY sequence_no DESC LIMIT 1;
  IF v_policy.policy_snapshot_id IS NULL THEN RAISE EXCEPTION 'no exact active policy'; END IF;
  v_required:=ARRAY['editorial_angle_receipt.v1','platform_fit_receipt.v1','visual_brief_receipt.v1','visual_qa_receipt.v1','copy_visual_coherence_receipt.v1','same_shit_memory_receipt.v1','callscore.task_router_receipt.v1','callscore.tool_inheritance_receipt.v1'];
  IF v_i.is_media THEN v_required:=v_required||ARRAY['callscore.design_bundle_reference_receipt.v1','callscore.website_design_alignment_receipt.v2','callscore.branding_receipt.v2','callscore.brand_lockup_occlusion_check.v1','callscore.media_artifact_receipt.v2']; END IF;
  IF v_i.is_youtube THEN v_required:=v_required||ARRAY['youtube_script_receipt.v1','youtube_packaging_receipt.v1','youtube_thumbnail_receipt.v1','youtube_publish_package_receipt.v1','youtube_analytics_receipt.v1']; END IF;
  FOREACH v_schema IN ARRAY v_required LOOP
    IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.canonical_receipt_evidence WHERE workflow_id=p_workflow_id AND receipt_schema=v_schema AND status='PASS' AND stale_at>clock_timestamp()) THEN
      RAISE EXCEPTION 'missing/stale receipt %',v_schema USING ERRCODE='23514';
    END IF;
  END LOOP;
  INSERT INTO callscore_plan_contract.external_action_grants(
    grant_id,workflow_id,intent_id,sequence_no,authority_source,policy_snapshot_id,account_scope_hash,
    mutation_family,provider_tool,action_name,publication_revision,payload_sha256,issued_by_role,issued_at,expires_at
  ) VALUES (v_grant,p_workflow_id,p_intent_id,1,'READY_PUBLIC_OWNED_POLICY',v_policy.policy_snapshot_id,
    v_i.account_scope_hash,v_i.mutation_family,v_i.provider_tool,v_i.action_name,v_i.publication_revision,
    v_i.payload_sha256,'callscore_function_owner',clock_timestamp(),LEAST(v_i.expires_at,clock_timestamp()+interval '15 minutes'));
  RETURN v_grant;
END;
$$;

CREATE FUNCTION record_generation_provenance(
  p_generation_id uuid,p_workflow_id uuid,p_delegation_id uuid,p_producer_agent_id text,p_delegated_role text,
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
        v_output callscore_plan_contract.autonomy_artifacts; v_seq bigint;
BEGIN
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_a FROM callscore_plan_contract.runtime_variant_assignments WHERE workflow_id=p_workflow_id;
  SELECT * INTO v_prompt FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_resolved_prompt_artifact_id;
  SELECT * INTO v_output FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_output_artifact_id;
  IF v_w.workflow_id IS NULL OR v_a.assignment_id IS NULL OR v_prompt.artifact_id IS NULL OR v_output.artifact_id IS NULL
     OR p_hermes_session_id IS NULL OR p_finished_at<p_started_at
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_prompt_secret_scan_artifact_id AND artifact_kind='prompt_secret_scan_receipt') THEN
    RAISE EXCEPTION 'generation lineage/artifact/time predicate failed' USING ERRCODE='23514';
  END IF;
  IF p_delegation_id IS NOT NULL THEN
    SELECT * INTO v_d FROM callscore_plan_contract.agent_delegations
     WHERE delegation_id=p_delegation_id AND workflow_id=p_workflow_id AND launch_status='ACCEPTED'
       AND canonical_child_agent_id=p_producer_agent_id AND delegated_role=p_delegated_role
       AND hermes_session_id=p_hermes_session_id;
    IF v_d.delegation_id IS NULL THEN RAISE EXCEPTION 'generation delegation identity not ACCEPTED' USING ERRCODE='23514'; END IF;
  ELSIF p_delegated_role<>'head-synthesizer' OR p_producer_agent_id<>v_w.head_agent_id THEN
    RAISE EXCEPTION 'only canonical head synthesis may omit delegation' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.generation_provenance WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.generation_provenance(
    generation_id,workflow_id,workflow_run_id,sequence_no,delegation_id,producer_agent_id,delegated_role,channel,task_type,
    hermes_session_id,prompt_name,prompt_version,prompt_sha256,resolved_prompt_artifact_id,prompt_secret_scan_artifact_id,
    model,provider,parameters,toolsets,tools_manifest_sha256,skills,skills_manifest_sha256,registry_version,policy_version,
    experiment_id,cohort_id,variant_id,input_evidence_sha256,output_artifact_id,output_sha256,token_usage,cost_usd,started_at,finished_at
  ) VALUES (
    p_generation_id,p_workflow_id,v_w.workflow_run_id,v_seq,p_delegation_id,p_producer_agent_id,p_delegated_role,v_w.channel,v_w.task_type,
    p_hermes_session_id,p_prompt_name,p_prompt_version,v_prompt.content_sha256,p_resolved_prompt_artifact_id,p_prompt_secret_scan_artifact_id,
    p_model,p_provider,p_parameters,p_toolsets,p_tools_manifest_sha256,p_skills,p_skills_manifest_sha256,v_a.registry_version::text,v_w.policy_version,
    v_a.experiment_id,v_a.cohort_id,v_a.variant_id,p_input_evidence_sha256,p_output_artifact_id,v_output.content_sha256,p_token_usage,p_cost_usd,p_started_at,p_finished_at
  );
  RETURN p_generation_id;
END;
$$;

CREATE FUNCTION record_quality_evaluation(
  p_evaluation_id uuid,
  p_workflow_id uuid,
  p_generation_id uuid,
  p_evaluator_generation_id uuid,
  p_deterministic_pass boolean,
  p_dimension_scores jsonb,
  p_similarity numeric,
  p_similarity_threshold numeric,
  p_controlled_reason_code text
) RETURNS quality_evaluations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_candidate callscore_plan_contract.generation_provenance; v_evaluator callscore_plan_contract.generation_provenance;
        v_weighted numeric; v_decision text; v_seq bigint; v_row callscore_plan_contract.quality_evaluations;
        v_keys text[]:=ARRAY['factual_accuracy','evidence_support','originality','platform_fit','clarity','callscore_voice','commercial_strength','actionability','handoff_readiness','hook','argument','native_structure','audience_relevance','cta','safety_compliance'];
        v_key text;
BEGIN
  SELECT * INTO v_candidate FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_evaluator FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_evaluator_generation_id AND delegated_role IN ('evaluator','trust-reviewer');
  IF v_candidate.generation_id IS NULL OR v_evaluator.generation_id IS NULL
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
  v_decision:=CASE WHEN p_deterministic_pass
    AND (p_dimension_scores->>'factual_accuracy')::numeric>=0.95
    AND (p_dimension_scores->>'evidence_support')::numeric>=0.95
    AND (p_dimension_scores->>'safety_compliance')::numeric=1
    AND NOT EXISTS(
      SELECT 1 FROM unnest(ARRAY['originality','platform_fit','clarity','callscore_voice','commercial_strength','actionability','handoff_readiness','hook','argument','native_structure','audience_relevance','cta']) k
      WHERE (p_dimension_scores->>k)::numeric<0.80
    )
    AND v_weighted>=0.86 AND p_similarity<p_similarity_threshold THEN 'ACCEPT'
    WHEN NOT p_deterministic_pass OR (p_dimension_scores->>'safety_compliance')::numeric<1 THEN 'REJECT'
    ELSE 'REVISE' END;
  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq FROM callscore_plan_contract.quality_evaluations WHERE workflow_id=p_workflow_id;
  INSERT INTO callscore_plan_contract.quality_evaluations(
    evaluation_id,workflow_id,sequence_no,generation_id,evaluator_generation_id,evaluator_agent_id,decision,
    deterministic_gates,semantic_scores,similarity_score,similarity_threshold,weighted_score,
    acceptance_thresholds,controlled_reason_codes
  ) VALUES (p_evaluation_id,p_workflow_id,v_seq,p_generation_id,p_evaluator_generation_id,v_evaluator.producer_agent_id,v_decision,
    jsonb_build_object('pass',p_deterministic_pass),p_dimension_scores,p_similarity,p_similarity_threshold,v_weighted,
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
  p_operation_id uuid,p_workflow_id uuid,p_intent_id uuid,p_grant_id uuid,p_worker_id text,p_lease_token uuid
) RETURNS provider_operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_i callscore_plan_contract.provider_operation_intents; v_g callscore_plan_contract.external_action_grants; v_o callscore_plan_contract.provider_operations; v_key text;
BEGIN
  SELECT * INTO v_i FROM callscore_plan_contract.provider_operation_intents WHERE intent_id=p_intent_id AND workflow_id=p_workflow_id;
  SELECT * INTO v_g FROM callscore_plan_contract.external_action_grants WHERE grant_id=p_grant_id AND workflow_id=p_workflow_id AND intent_id=p_intent_id FOR UPDATE;
  IF v_i.intent_id IS NULL OR v_g.grant_id IS NULL OR v_g.expires_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM callscore_plan_contract.external_action_grant_revocations WHERE grant_id=p_grant_id) THEN
    RAISE EXCEPTION 'invalid/revoked/expired exact grant' USING ERRCODE='23514';
  END IF;
  v_key:=encode(sha256(convert_to(jsonb_build_object(
    'workflow_id',p_workflow_id,'publication_revision',v_i.publication_revision,'account_scope_hash',v_i.account_scope_hash,
    'provider_tool',v_i.provider_tool,'action_name',v_i.action_name,'payload_sha256',v_i.payload_sha256
  )::text,'UTF8')),'hex');
  INSERT INTO callscore_plan_contract.provider_operations(
    operation_id,workflow_id,intent_id,authority_grant_id,publication_revision,account_scope_hash,
    provider_tool,action_name,payload_sha256,idempotency_key,provider_state,lease_owner,lease_token,lease_generation,lease_expires_at
  ) VALUES (p_operation_id,p_workflow_id,p_intent_id,p_grant_id,v_i.publication_revision,v_i.account_scope_hash,
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
  WHERE operation_id=p_operation_id AND provider_state='CLAIMED' AND state_version=p_expected_version AND lease_token=p_lease_token
  RETURNING * INTO v_o;
  IF v_o.operation_id IS NULL THEN RAISE EXCEPTION 'dispatch boundary CAS failed' USING ERRCODE='40001'; END IF;
  INSERT INTO callscore_plan_contract.provider_operation_events(event_id,operation_id,sequence_no,from_state,to_state,controlled_reason_code,dispatch_boundary_at)
  VALUES(gen_random_uuid(),p_operation_id,v_o.state_version+1,'CLAIMED','DISPATCHING','network_dispatch_may_begin',clock_timestamp());
  RETURN v_o;
END;
$$;

CREATE FUNCTION insert_verified_autonomy_report(
  p_report_id uuid,
  p_report_stream_id text,
  p_sequence_no bigint,
  p_app_commit_sha char(40),
  p_workplane_commit_sha char(40),
  p_deployment_manifest_sha256 char(64),
  p_report_json_artifact_id uuid,
  p_report_json_sha256 char(64),
  p_producer_agent_id text,
  p_verifier_agent_id text,
  p_verifier_artifact_id uuid,
  p_verifier_sha256 char(64),
  p_live_activation_approved boolean,
  p_blockers jsonb,
  p_canary_provider_operation_id uuid,
  p_canary_readback_artifact_id uuid,
  p_canary_rollback_artifact_id uuid
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
     AND readback_receipt_artifact_id=p_canary_readback_artifact_id
     AND external_object_id IS NOT NULL;
  IF v_operation.operation_id IS NULL THEN
    RAISE EXCEPTION 'final PASS requires exact VERIFIED canary/readback relation' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_report_json_artifact_id AND content_sha256=p_report_json_sha256)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_verifier_artifact_id AND content_sha256=p_verifier_sha256)
     OR NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_canary_rollback_artifact_id) THEN
    RAISE EXCEPTION 'final PASS artifact relation/hash failed' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.autonomy_final_reports(
    report_id,report_stream_id,sequence_no,report_schema,app_commit_sha,workplane_commit_sha,
    deployment_manifest_sha256,report_json_artifact_id,report_json_sha256,producer_agent_id,
    verifier_agent_id,verifier_artifact_id,verifier_sha256,verifier_status,final_status,
    live_activation_approved,blockers,canary_status,canary_provider_operation_id,
    canary_readback_artifact_id,canary_rollback_artifact_id
  ) VALUES (
    p_report_id,p_report_stream_id,p_sequence_no,'callscore.autonomy_implementation_report.v2',
    p_app_commit_sha,p_workplane_commit_sha,p_deployment_manifest_sha256,p_report_json_artifact_id,
    p_report_json_sha256,p_producer_agent_id,p_verifier_agent_id,p_verifier_artifact_id,
    p_verifier_sha256,'PASS','PASS',true,p_blockers,'PASS',p_canary_provider_operation_id,
    p_canary_readback_artifact_id,p_canary_rollback_artifact_id
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
  IF p_denominator<=0 OR p_window_ended_at<p_window_started_at THEN RAISE EXCEPTION 'invalid outcome denominator/window' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  SELECT * INTO v_g FROM callscore_plan_contract.generation_provenance WHERE generation_id=p_generation_id AND workflow_id=p_workflow_id;
  IF v_w.workflow_state<>'OUTCOME_PENDING' OR v_g.generation_id IS NULL THEN RAISE EXCEPTION 'outcome lineage/state invalid' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM callscore_plan_contract.autonomy_artifacts WHERE artifact_id=p_source_artifact_id AND content_sha256=p_source_sha256) THEN
    RAISE EXCEPTION 'outcome source artifact hash mismatch' USING ERRCODE='23514';
  END IF;
  IF v_w.execution_class='OWNED_PUBLIC_MUTATION' THEN
    SELECT * INTO v_o FROM callscore_plan_contract.provider_operations WHERE operation_id=p_operation_id AND workflow_id=p_workflow_id AND provider_state='VERIFIED';
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
       OR NOT EXISTS(
         SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
         WHERE artifact_id=p_validation_artifact_ids[v_i] AND artifact_kind='json_schema_validation_receipt'
       ) THEN RAISE EXCEPTION 'learning schema/provenance/validation receipt mismatch at index %',v_i USING ERRCODE='23514';
    END IF;
    v_payload_sha:=encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
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
     AND lease_expires_at<clock_timestamp() FOR UPDATE;
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
  SELECT DISTINCT ON (q.workflow_id) q.workflow_id,q.weighted_score
  FROM callscore_plan_contract.quality_evaluations q
  WHERE q.decision='ACCEPT' ORDER BY q.workflow_id,q.sequence_no DESC
), latest_measurements AS (
  SELECT DISTINCT ON (m.workflow_id) m.*
  FROM callscore_plan_contract.outcome_measurements m
  JOIN experiment e ON e.experiment_id=m.experiment_id AND e.primary_metric=m.metric_name
  ORDER BY m.workflow_id,m.window_ended_at DESC,m.sequence_no DESC
), observations AS (
  SELECT m.workflow_id,c.cohort_name,m.metric_value,q.weighted_score,m.window_ended_at
  FROM latest_measurements m
  JOIN callscore_plan_contract.runtime_cohorts c
    ON c.experiment_id=m.experiment_id AND c.cohort_id=m.cohort_id AND c.variant_id=m.variant_id
  JOIN latest_quality q ON q.workflow_id=m.workflow_id
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
  SELECT CASE WHEN count(*) FILTER (WHERE x.execution_class='OWNED_PUBLIC_MUTATION')=0 THEN 1::numeric
              ELSE count(*) FILTER (WHERE x.execution_class='OWNED_PUBLIC_MUTATION' AND x.has_verified_operation)::numeric
                   / count(*) FILTER (WHERE x.execution_class='OWNED_PUBLIC_MUTATION') END AS rate
  FROM (
    SELECT w.workflow_id,w.execution_class,EXISTS(
      SELECT 1 FROM callscore_plan_contract.provider_operations p
      WHERE p.workflow_id=w.workflow_id AND p.provider_state='VERIFIED'
    ) AS has_verified_operation
    FROM callscore_plan_contract.runtime_variant_assignments a
    JOIN callscore_plan_contract.autonomy_workflows w ON w.workflow_id=a.workflow_id
    WHERE a.experiment_id=p_experiment_id
  ) x
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

CREATE FUNCTION assign_runtime_variant(p_workflow_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, callscore_plan_contract
AS $$
DECLARE v_w callscore_plan_contract.autonomy_workflows; v_e callscore_plan_contract.runtime_experiments;
        v_r callscore_plan_contract.runtime_registry; v_cohort callscore_plan_contract.runtime_cohorts;
        v_bucket integer; v_assignment uuid:=gen_random_uuid(); v_hash bytea;
BEGIN
  SELECT * INTO v_w FROM callscore_plan_contract.autonomy_workflows WHERE workflow_id=p_workflow_id FOR UPDATE;
  IF v_w.workflow_state<>'HEAD_PLANNING' THEN RAISE EXCEPTION 'variant assignment requires HEAD_PLANNING' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_e FROM callscore_plan_contract.runtime_experiments
   WHERE agent_id=v_w.head_agent_id AND channel=v_w.channel AND task_type=v_w.task_type AND policy_version=v_w.policy_version
     AND starts_at<=clock_timestamp() AND (ends_at IS NULL OR ends_at>clock_timestamp())
   ORDER BY starts_at DESC LIMIT 1;
  SELECT * INTO v_r FROM callscore_plan_contract.runtime_registry
   WHERE agent_id=v_w.head_agent_id AND channel=v_w.channel AND task_type=v_w.task_type AND policy_version=v_w.policy_version;
  IF v_r.active_variant_id IS NULL THEN RAISE EXCEPTION 'no exact active registry' USING ERRCODE='23514'; END IF;
  IF v_e.experiment_id IS NULL THEN
    INSERT INTO callscore_plan_contract.runtime_variant_assignments(
      assignment_id,workflow_id,sequence_no,variant_id,registry_version
    ) VALUES (v_assignment,p_workflow_id,1,v_r.active_variant_id,v_r.registry_version);
    RETURN v_assignment;
  END IF;
  v_hash:=sha256(convert_to(jsonb_build_object('experiment_id',v_e.experiment_id,'workflow_id',p_workflow_id)::text,'UTF8'));
  v_bucket:=((('x'||substr(encode(v_hash,'hex'),1,16))::bit(64)::bigint & 9223372036854775807) % 100)::integer;
  SELECT * INTO v_cohort FROM callscore_plan_contract.runtime_cohorts
   WHERE experiment_id=v_e.experiment_id AND cohort_name=CASE WHEN v_bucket<80 THEN 'CONTROL' ELSE 'TREATMENT' END;
  IF v_cohort.cohort_id IS NULL OR (v_bucket<80 AND v_cohort.variant_id<>v_r.active_variant_id) THEN
    RAISE EXCEPTION 'cohort/registry variant mismatch' USING ERRCODE='23514';
  END IF;
  INSERT INTO callscore_plan_contract.runtime_variant_assignments(
    assignment_id,workflow_id,experiment_id,sequence_no,cohort_id,cohort_name,variant_id,
    assignment_bucket,assignment_ratio_control,registry_version
  ) VALUES (v_assignment,p_workflow_id,v_e.experiment_id,1,v_cohort.cohort_id,v_cohort.cohort_name,
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
  ) VALUES (v_event,p_experiment_id,v_seq,v_r.rollback_variant_id,v_r.active_variant_id,'ROLLBACK',
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
BEGIN
  SELECT provider_state INTO v_prior FROM callscore_plan_contract.provider_operations
   WHERE operation_id=p_operation_id AND state_version=p_expected_version AND lease_token=p_lease_token FOR UPDATE;
  IF v_prior IS NULL THEN RAISE EXCEPTION 'provider result CAS/lease mismatch' USING ERRCODE='40001'; END IF;
  IF NOT ((v_prior='DISPATCHING' AND p_to_state IN ('SUBMITTED','UNKNOWN','FAILED_TERMINAL'))
       OR (v_prior='SUBMITTED' AND p_to_state IN ('VERIFIED','UNKNOWN','FAILED_TERMINAL'))) THEN
    RAISE EXCEPTION 'provider result transition forbidden' USING ERRCODE='23514';
  END IF;
  IF p_to_state IN ('SUBMITTED','VERIFIED') AND (p_receipt_artifact_id IS NULL OR p_external_object_id IS NULL) THEN
    RAISE EXCEPTION 'provider success state requires durable receipt and external id' USING ERRCODE='23514';
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
    SELECT 1 FROM callscore_plan_contract.autonomy_artifacts
    WHERE artifact_id=p_absence_receipt_artifact_id AND artifact_kind='provider_absence_readback_receipt'
  ) THEN RAISE EXCEPTION 'independent provider absence receipt missing' USING ERRCODE='23514'; END IF;
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
ALTER FUNCTION transition_is_allowed(callscore_execution_class,callscore_workflow_state,callscore_workflow_state) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION enqueue_autonomy_workflow(uuid,uuid,uuid,text,callscore_execution_class,text,text,text,text,jsonb,char) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION backfill_legacy_channel_tasks() OWNER TO callscore_plan_function_owner;
ALTER FUNCTION set_activation_fence(boolean,bigint,text,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION create_agent_delegation(uuid,uuid,integer,text,smallint,text,text,text,char,text,text,jsonb,text,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_agent_delegation_event(uuid,callscore_join_status,bigint,callscore_join_status,integer,integer,bigint,text,uuid,char,uuid,char,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_autonomy_artifact(uuid,text,text,char,bigint,text,text,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION claim_autonomy_workflow(uuid,text,uuid,bigint,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION heartbeat_autonomy_workflow(uuid,bigint,bigint,uuid,integer) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION transition_autonomy_workflow(uuid,callscore_workflow_state,callscore_workflow_state,bigint,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION mint_ready_public_owned_grant(uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_generation_provenance(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,jsonb,jsonb,char,jsonb,char,jsonb,uuid,jsonb,numeric,timestamptz,timestamptz) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_quality_evaluation(uuid,uuid,uuid,uuid,boolean,jsonb,numeric,numeric,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_artifact_revision(uuid,uuid,uuid,uuid,uuid,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION create_provider_operation(uuid,uuid,uuid,uuid,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION mark_provider_dispatching(uuid,bigint,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION insert_verified_autonomy_report(uuid,text,bigint,char,char,char,uuid,char,text,text,uuid,char,boolean,jsonb,uuid,uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_outcome_measurement(uuid,uuid,uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,uuid,char,jsonb) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_canonical_learning_set(uuid,uuid,uuid,uuid[],jsonb[],uuid[]) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reclaim_provider_claim(uuid,bigint,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION compute_runtime_experiment_statistics(uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION assign_runtime_variant(uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION promote_runtime_variant(uuid,bigint,uuid,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION rollback_runtime_variant(uuid,bigint,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION record_provider_result(uuid,bigint,uuid,callscore_provider_state,text,char,text,text,uuid) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reconcile_ambiguous_provider_dispatch(uuid,bigint,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION confirm_provider_not_performed(uuid,bigint,uuid,text) OWNER TO callscore_plan_function_owner;
ALTER FUNCTION reclaim_confirmed_not_performed(uuid,bigint,text,uuid) OWNER TO callscore_plan_function_owner;

GRANT USAGE ON SCHEMA callscore_plan_contract TO callscore_plan_function_owner,callscore_plan_runtime,callscore_plan_policy_writer,callscore_plan_enqueue,callscore_plan_observer,callscore_plan_report_verifier;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA callscore_plan_contract TO callscore_plan_function_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA callscore_plan_contract TO callscore_plan_runtime,callscore_plan_observer;
GRANT INSERT ON canonical_policy_snapshots,canonical_receipt_evidence,autonomy_artifacts TO callscore_plan_policy_writer;
REVOKE ALL ON ALL TABLES IN SCHEMA callscore_plan_contract FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA callscore_plan_contract FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_autonomy_workflow(uuid,uuid,uuid,text,callscore_execution_class,text,text,text,text,jsonb,char) TO callscore_plan_enqueue;
GRANT EXECUTE ON FUNCTION claim_autonomy_workflow(uuid,text,uuid,bigint,integer),heartbeat_autonomy_workflow(uuid,bigint,bigint,uuid,integer),transition_autonomy_workflow(uuid,callscore_workflow_state,callscore_workflow_state,bigint,uuid,text),create_agent_delegation(uuid,uuid,integer,text,smallint,text,text,text,char,text,text,jsonb,text,timestamptz),record_agent_delegation_event(uuid,callscore_join_status,bigint,callscore_join_status,integer,integer,bigint,text,uuid,char,uuid,char,jsonb),record_autonomy_artifact(uuid,text,text,char,bigint,text,text,text),record_generation_provenance(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,jsonb,jsonb,char,jsonb,char,jsonb,uuid,jsonb,numeric,timestamptz,timestamptz),record_quality_evaluation(uuid,uuid,uuid,uuid,boolean,jsonb,numeric,numeric,text),record_artifact_revision(uuid,uuid,uuid,uuid,uuid,jsonb),mint_ready_public_owned_grant(uuid,uuid),create_provider_operation(uuid,uuid,uuid,uuid,text,uuid),mark_provider_dispatching(uuid,bigint,uuid),reclaim_provider_claim(uuid,bigint,text,uuid),record_provider_result(uuid,bigint,uuid,callscore_provider_state,text,char,text,text,uuid),reconcile_ambiguous_provider_dispatch(uuid,bigint,text),confirm_provider_not_performed(uuid,bigint,uuid,text),reclaim_confirmed_not_performed(uuid,bigint,text,uuid),record_outcome_measurement(uuid,uuid,uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,uuid,char,jsonb),record_canonical_learning_set(uuid,uuid,uuid,uuid[],jsonb[],uuid[]),compute_runtime_experiment_statistics(uuid),assign_runtime_variant(uuid),promote_runtime_variant(uuid,bigint,uuid,uuid),rollback_runtime_variant(uuid,bigint,uuid) TO callscore_plan_runtime;
GRANT EXECUTE ON FUNCTION set_activation_fence(boolean,bigint,text,text) TO callscore_plan_policy_writer;
GRANT EXECUTE ON FUNCTION insert_verified_autonomy_report(uuid,text,bigint,char,char,char,uuid,char,text,text,uuid,char,boolean,jsonb,uuid,uuid,uuid) TO callscore_plan_report_verifier;

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
  '01000000-0000-0000-0000-000000000001','fixture-task-1','RESTRICTED_DRAFT','callscore-x-head','x','x_owned_post','policy-v1','{}',repeat('a',64)
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
SELECT set_activation_fence(false,0,'fixture_unfence','callscore_plan_policy_writer');
RESET ROLE;

SET LOCAL ROLE callscore_plan_runtime;
SELECT (claim_autonomy_workflow('00000000-0000-0000-0000-000000000001','fixture-worker','00000000-0000-0000-0000-000000000201',0,30)).workflow_state;
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

-- Multiple null pre-completion session IDs are legal; duplicate non-null IDs are not.
INSERT INTO agent_delegations(
  delegation_id,workflow_id,workflow_run_id,revision_number,delegated_role,ordinal,canonical_child_agent_id,
  launch_status,usage_file_path,stdout_file_path,prompt_sha256,model,provider,allowed_capabilities,required_output_schema,lease_generation,deadline_at
) VALUES
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',0,'research',0,'callscore-x-research-child','DISPATCH_INTENT','/tmp/a.usage','/tmp/a.out',repeat('d',64),'m','p','{}','s',1,clock_timestamp()+interval '1 minute'),
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',0,'critic',1,'callscore-x-critic-child','DISPATCH_INTENT','/tmp/b.usage','/tmp/b.out',repeat('e',64),'m','p','{}','s',1,clock_timestamp()+interval '1 minute');

-- Execute the statistics function even for an empty experiment ID so PostgreSQL validates its return contract.
SET LOCAL ROLE callscore_plan_runtime;
SELECT count(*) AS empty_statistics_rows
FROM compute_runtime_experiment_statistics('30000000-0000-0000-0000-000000000001');
RESET ROLE;

SELECT 'autonomy_contract_v3_passed' AS result;
ROLLBACK;
