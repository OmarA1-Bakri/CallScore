-- Disposable contract proof for migration 025.
-- Run only inside one transaction against local PostgreSQL 18:
--   psql -X -v ON_ERROR_STOP=1 -f this-file
-- Every object lives in callscore_plan_contract and the final ROLLBACK removes it.
BEGIN;
CREATE SCHEMA callscore_plan_contract;
SET LOCAL search_path TO callscore_plan_contract, public;

CREATE TYPE callscore_workflow_state AS ENUM (
  'QUEUED','HEAD_PLANNING','CHILDREN_RUNNING','HEAD_SYNTHESIS',
  'QUALITY_EVALUATION','REVISION','READY','EXECUTING','PROVIDER_VERIFIED',
  'OUTCOME_MEASURED','LEARNING_RECORDED','COMPLETE','RETRY','FAILED'
);
CREATE TYPE callscore_achievement_class AS ENUM (
  'OBSERVED','REPORTED','DRAFTED','QUALITY_PASSED','READY','EXECUTED',
  'PROVIDER_VERIFIED','OUTCOME_MEASURED','COMPLETE','FAILED'
);
CREATE TYPE callscore_execution_class AS ENUM (
  'OWNED_PUBLIC_MUTATION','INTERNAL_ARTIFACT','READ_ONLY_OBSERVATION','RESTRICTED_DRAFT'
);
CREATE TYPE callscore_join_status AS ENUM (
  'DISPATCH_INTENT','SPAWNED','RUNNING','SUCCEEDED','FAILED','TIMED_OUT',
  'CANCELLED','ORPHANED','ACCEPTED','REJECTED'
);
CREATE TYPE callscore_evaluation_decision AS ENUM ('ACCEPT','REVISE','REJECT');
CREATE TYPE callscore_provider_state AS ENUM (
  'INTENT','CLAIMED','SUBMITTED','CONFIRMED_NOT_PERFORMED','UNKNOWN',
  'VERIFIED','FAILED_RETRYABLE','FAILED_TERMINAL'
);
CREATE TYPE callscore_authority_source AS ENUM ('READY_PUBLIC_OWNED_POLICY','OPERATOR_GATE');

-- Fixture for the existing table. Production migration references public.channel_tasks.
CREATE TABLE channel_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE autonomy_workflows (
  workflow_id uuid PRIMARY KEY,
  source_channel_task_id bigint UNIQUE REFERENCES channel_tasks(id) ON DELETE RESTRICT,
  execution_class callscore_execution_class NOT NULL,
  workflow_state callscore_workflow_state NOT NULL DEFAULT 'QUEUED',
  achievement_class callscore_achievement_class NOT NULL DEFAULT 'OBSERVED',
  channel text NOT NULL CHECK (btrim(channel) <> ''),
  task_type text NOT NULL CHECK (btrim(task_type) <> ''),
  input_payload jsonb NOT NULL,
  input_payload_sha256 char(64) NOT NULL CHECK (input_payload_sha256 ~ '^[0-9a-f]{64}$'),
  checkpoint_namespace text NOT NULL,
  checkpoint_thread_id text NOT NULL UNIQUE,
  active_run_id uuid,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  lease_owner text,
  lease_token uuid,
  lease_generation bigint NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  previous_executable_state callscore_workflow_state,
  revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 3),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 20),
  retry_at timestamptz,
  terminal_reason_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR
    (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (workflow_state = 'RETRY' AND previous_executable_state IS NOT NULL AND retry_at IS NOT NULL)
    OR
    (workflow_state <> 'RETRY' AND retry_at IS NULL)
  ),
  CHECK (workflow_state NOT IN ('COMPLETE','FAILED') OR lease_owner IS NULL),
  CHECK (workflow_state <> 'COMPLETE' OR achievement_class = 'COMPLETE'),
  CHECK (workflow_state <> 'FAILED' OR achievement_class = 'FAILED')
);
CREATE INDEX autonomy_workflows_intake_idx
  ON autonomy_workflows (workflow_state, retry_at, created_at, workflow_id)
  WHERE workflow_state IN ('QUEUED','RETRY');
CREATE INDEX autonomy_workflows_lease_idx
  ON autonomy_workflows (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

CREATE TABLE autonomy_workflow_transitions (
  transition_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  from_state callscore_workflow_state NOT NULL,
  to_state callscore_workflow_state NOT NULL,
  from_state_version bigint NOT NULL CHECK (from_state_version >= 0),
  to_state_version bigint NOT NULL CHECK (to_state_version = from_state_version + 1),
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  lease_token_hash char(64),
  run_id uuid,
  controlled_reason_code text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, to_state_version),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE external_action_grants (
  grant_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  authority_source callscore_authority_source NOT NULL,
  policy_commit_sha char(40) NOT NULL CHECK (policy_commit_sha ~ '^[0-9a-f]{40}$'),
  policy_record_id text NOT NULL,
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  mutation_family text NOT NULL,
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  issued_by_role text NOT NULL CHECK (issued_by_role IN ('callscore_policy_writer','callscore_operator_gate_writer')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses = 1),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  UNIQUE (workflow_id, account_scope_hash, provider_tool, action_name, payload_sha256),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE external_action_grant_revocations (
  revocation_id uuid PRIMARY KEY,
  grant_id uuid NOT NULL UNIQUE REFERENCES external_action_grants(grant_id) ON DELETE RESTRICT,
  revoked_by_role text NOT NULL CHECK (revoked_by_role IN ('callscore_policy_writer','callscore_operator_gate_writer')),
  controlled_reason_code text NOT NULL,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE agent_delegations (
  delegation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  delegated_role text NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  canonical_child_agent_id text NOT NULL,
  launch_status callscore_join_status NOT NULL,
  wrapper_pid integer CHECK (wrapper_pid IS NULL OR wrapper_pid > 1),
  wrapper_start_ticks bigint CHECK (wrapper_start_ticks IS NULL OR wrapper_start_ticks >= 0),
  hermes_session_id text,
  usage_file_path text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  model text NOT NULL,
  provider text NOT NULL,
  allowed_capabilities jsonb NOT NULL,
  required_output_schema text NOT NULL,
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, run_id, revision_number, delegated_role, ordinal),
  UNIQUE (usage_file_path),
  UNIQUE NULLS NOT DISTINCT (hermes_session_id)
);
CREATE INDEX agent_delegations_join_idx
  ON agent_delegations (workflow_id, run_id, revision_number, launch_status);

CREATE TABLE agent_delegation_events (
  event_id uuid PRIMARY KEY,
  delegation_id uuid NOT NULL REFERENCES agent_delegations(delegation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  status callscore_join_status NOT NULL,
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  wrapper_pid integer,
  wrapper_start_ticks bigint,
  hermes_session_id text,
  output_artifact_id uuid,
  output_sha256 char(64) CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (delegation_id, sequence_no),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE generation_provenance (
  generation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  delegation_id uuid REFERENCES agent_delegations(delegation_id) ON DELETE RESTRICT,
  producer_agent_id text NOT NULL,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  resolved_prompt_artifact_id uuid NOT NULL,
  prompt_secret_scan_artifact_id uuid NOT NULL,
  prompt_contains_secret boolean NOT NULL DEFAULT false CHECK (prompt_contains_secret = false),
  model text NOT NULL,
  provider text NOT NULL,
  parameters jsonb NOT NULL,
  policy_version text NOT NULL,
  input_evidence_sha256 jsonb NOT NULL,
  output_artifact_id uuid NOT NULL,
  output_sha256 char(64) NOT NULL CHECK (output_sha256 ~ '^[0-9a-f]{64}$'),
  token_usage jsonb NOT NULL,
  cost_usd numeric(18,8) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE quality_evaluations (
  evaluation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 0 AND 3),
  source_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  evaluator_agent_id text NOT NULL,
  evaluator_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  decision callscore_evaluation_decision NOT NULL,
  deterministic_scores jsonb NOT NULL,
  semantic_scores jsonb NOT NULL,
  controlled_reason_codes text[] NOT NULL,
  source_output_sha256 char(64) NOT NULL CHECK (source_output_sha256 ~ '^[0-9a-f]{64}$'),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, run_id, revision_number, evaluator_agent_id),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE artifact_revisions (
  artifact_revision_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number BETWEEN 1 AND 3),
  source_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  source_evaluation_id uuid NOT NULL REFERENCES quality_evaluations(evaluation_id) ON DELETE RESTRICT,
  revised_generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  revised_sha256 char(64) NOT NULL CHECK (revised_sha256 ~ '^[0-9a-f]{64}$'),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, run_id, revision_number),
  CHECK (source_sha256 <> revised_sha256),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE provider_operations (
  operation_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  authority_grant_id uuid NOT NULL UNIQUE REFERENCES external_action_grants(grant_id) ON DELETE RESTRICT,
  account_scope_hash char(64) NOT NULL CHECK (account_scope_hash ~ '^[0-9a-f]{64}$'),
  mutation_family text NOT NULL,
  provider_tool text NOT NULL,
  action_name text NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key char(64) NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  provider_native_idempotency_key text,
  provider_state callscore_provider_state NOT NULL DEFAULT 'INTENT',
  claim_owner text,
  claim_token uuid,
  claim_generation bigint NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  claim_expires_at timestamptz,
  external_object_id text,
  external_url text,
  submitted_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, account_scope_hash, provider_tool, action_name, payload_sha256),
  CHECK (
    (claim_owner IS NULL AND claim_token IS NULL AND claim_expires_at IS NULL)
    OR
    (claim_owner IS NOT NULL AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
  ),
  CHECK (provider_state <> 'VERIFIED' OR (external_object_id IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (provider_state <> 'UNKNOWN' OR submitted_at IS NOT NULL)
);

CREATE TABLE provider_operation_events (
  event_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  provider_state callscore_provider_state NOT NULL,
  claim_generation bigint NOT NULL CHECK (claim_generation >= 0),
  request_artifact_id uuid,
  response_artifact_id uuid,
  readback_artifact_id uuid,
  external_object_id text,
  external_url text,
  provider_status_code integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id, sequence_no),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE outcome_measurements (
  measurement_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  operation_id uuid REFERENCES provider_operations(operation_id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  channel text NOT NULL,
  provider_object_id text,
  cohort_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL CHECK (window_ended_at > window_started_at),
  metric_name text NOT NULL,
  numerator numeric(24,8) NOT NULL,
  denominator numeric(24,8) NOT NULL CHECK (denominator > 0),
  metric_value numeric(24,8) GENERATED ALWAYS AS (numerator / denominator) STORED,
  raw_readback_artifact_id uuid NOT NULL,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, metric_name, window_started_at, window_ended_at),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE canonical_learning_artifacts (
  learning_artifact_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  measurement_id uuid NOT NULL REFERENCES outcome_measurements(measurement_id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL REFERENCES generation_provenance(generation_id) ON DELETE RESTRICT,
  artifact_schema text NOT NULL CHECK (artifact_schema IN (
    'learning_event.v1','agent_performance_ledger.v1','learning_delta.v1','experiment_result.v1'
  )),
  artifact_id uuid NOT NULL,
  artifact_sha256 char(64) NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_payload jsonb NOT NULL,
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workflow_id, measurement_id, artifact_schema),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE runtime_variants (
  variant_id uuid PRIMARY KEY,
  agent_id text NOT NULL,
  channel text NOT NULL,
  policy_version text NOT NULL,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  prompt_sha256 char(64) NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  model text NOT NULL,
  provider text NOT NULL,
  parameters jsonb NOT NULL,
  created_from_variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (agent_id, channel, policy_version, prompt_sha256, model, provider)
);

CREATE TABLE runtime_registry (
  agent_id text NOT NULL,
  channel text NOT NULL,
  policy_version text NOT NULL,
  active_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  rollback_variant_id uuid REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  registry_version bigint NOT NULL DEFAULT 0 CHECK (registry_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (agent_id, channel, policy_version),
  CHECK (rollback_variant_id IS NULL OR rollback_variant_id <> active_variant_id)
);

CREATE TABLE runtime_variant_assignments (
  assignment_id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL UNIQUE REFERENCES autonomy_workflows(workflow_id) ON DELETE RESTRICT,
  experiment_id uuid NOT NULL,
  cohort_id uuid NOT NULL,
  variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  assignment_bucket smallint NOT NULL CHECK (assignment_bucket BETWEEN 0 AND 99),
  assignment_ratio_control smallint NOT NULL CHECK (assignment_ratio_control = 80),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE runtime_promotion_events (
  promotion_event_id uuid PRIMARY KEY,
  experiment_id uuid NOT NULL,
  agent_id text NOT NULL,
  channel text NOT NULL,
  policy_version text NOT NULL,
  prior_champion_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  candidate_variant_id uuid NOT NULL REFERENCES runtime_variants(variant_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('PROMOTE','REJECT','ROLLBACK')),
  evaluator_agent_id text NOT NULL,
  trust_agent_id text NOT NULL,
  control_sample_size integer NOT NULL CHECK (control_sample_size >= 30),
  treatment_sample_size integer NOT NULL CHECK (treatment_sample_size >= 30),
  observation_days integer NOT NULL CHECK (observation_days >= 14),
  quality_delta numeric(12,6) NOT NULL,
  outcome_relative_delta numeric(12,6) NOT NULL,
  bootstrap_ci95_lower numeric(12,6) NOT NULL,
  safety_violations integer NOT NULL CHECK (safety_violations >= 0),
  decision_payload jsonb NOT NULL,
  expected_registry_version bigint NOT NULL CHECK (expected_registry_version >= 0),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (experiment_id, decision, expected_registry_version),
  CHECK (prior_champion_variant_id <> candidate_variant_id),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE TABLE autonomy_final_reports (
  report_id uuid PRIMARY KEY,
  report_schema text NOT NULL CHECK (report_schema = 'callscore.autonomy_implementation_report.v1'),
  app_commit_sha char(40) NOT NULL CHECK (app_commit_sha ~ '^[0-9a-f]{40}$'),
  workplane_commit_sha char(40) NOT NULL CHECK (workplane_commit_sha ~ '^[0-9a-f]{40}$'),
  deployment_manifest_sha256 char(64) NOT NULL CHECK (deployment_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  report_json_artifact_id uuid NOT NULL,
  report_json_sha256 char(64) NOT NULL CHECK (report_json_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_artifact_id uuid NOT NULL,
  verifier_sha256 char(64) NOT NULL CHECK (verifier_sha256 ~ '^[0-9a-f]{64}$'),
  verifier_status text NOT NULL CHECK (verifier_status IN ('PASS','FAIL')),
  previous_record_hash bytea,
  record_hash bytea NOT NULL CHECK (octet_length(record_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_record_hash IS NULL OR octet_length(previous_record_hash) = 32)
);

CREATE FUNCTION reject_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION reject_projection_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'projection table % rejects DELETE', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'autonomy_workflow_transitions','external_action_grants','external_action_grant_revocations',
    'agent_delegation_events','generation_provenance',
    'quality_evaluations','artifact_revisions','provider_operation_events',
    'outcome_measurements','canonical_learning_artifacts','runtime_variants','runtime_variant_assignments',
    'runtime_promotion_events','autonomy_final_reports'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_reject_mutation BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'autonomy_workflows','agent_delegations','provider_operations','runtime_registry'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_reject_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_projection_delete()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA callscore_plan_contract FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA callscore_plan_contract FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA callscore_plan_contract FROM PUBLIC;

-- Positive construction plus adversarial constraint probes.
INSERT INTO channel_tasks(type,status,payload) VALUES ('x_owned_post','pending','{}') RETURNING id;
INSERT INTO autonomy_workflows(
  workflow_id,source_channel_task_id,execution_class,channel,task_type,input_payload,
  input_payload_sha256,checkpoint_namespace,checkpoint_thread_id
) VALUES (
  '00000000-0000-0000-0000-000000000001',1,'OWNED_PUBLIC_MUTATION','x','x_owned_post','{}',
  repeat('a',64),'callscore-supervisor/x','callscore-task:00000000-0000-0000-0000-000000000001'
);
INSERT INTO autonomy_workflow_transitions(
  transition_id,workflow_id,from_state,to_state,from_state_version,to_state_version,
  lease_generation,controlled_reason_code,record_hash
) VALUES (
  '10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  'QUEUED','HEAD_PLANNING',0,1,1,'claim_acquired',decode(repeat('00',32),'hex')
);

DO $$
BEGIN
  BEGIN
    UPDATE autonomy_workflow_transitions SET controlled_reason_code='forged' WHERE to_state_version=1;
    RAISE EXCEPTION 'append-only UPDATE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM autonomy_workflow_transitions WHERE to_state_version=1;
    RAISE EXCEPTION 'append-only DELETE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    INSERT INTO autonomy_workflows(
      workflow_id,execution_class,workflow_state,achievement_class,channel,task_type,input_payload,
      input_payload_sha256,checkpoint_namespace,checkpoint_thread_id,lease_owner
    ) VALUES (
      '00000000-0000-0000-0000-000000000002','INTERNAL_ARTIFACT','QUEUED','OBSERVED',
      'x','bad-lease','{}',repeat('b',64),'bad','bad', 'worker-without-token'
    );
    RAISE EXCEPTION 'lease coherence violation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO autonomy_workflow_transitions(
      transition_id,workflow_id,from_state,to_state,from_state_version,to_state_version,
      lease_generation,controlled_reason_code,record_hash
    ) VALUES (
      '10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
      'HEAD_PLANNING','CHILDREN_RUNNING',0,1,1,'duplicate_version',decode(repeat('11',32),'hex')
    );
    RAISE EXCEPTION 'duplicate transition version unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM autonomy_workflows WHERE workflow_id='00000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'parent delete unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

SELECT 'autonomy_contract_spike_passed' AS result;
ROLLBACK;
