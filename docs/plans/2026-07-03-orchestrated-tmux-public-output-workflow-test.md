# CallScore Orchestrated tmux Public-Output Workflow Test Plan

> **For Hermes:** Create the plan and task list first. Do not execute workflows until Omar explicitly asks to run this plan. When executing, use the existing CallScore orchestrator/channel-head architecture, tmux as temporary execution container, bounded concurrency, child-subagent proof, and no public/provider mutation.

**Goal:** Run a dry-run/test CallScore Orchestrator session that visibly starts tmux channel-head lanes, has each lane spawn child specialists, produces reviewable public-output artifacts for X, LinkedIn, YouTube, Reddit/community, and email, packages all outputs/logs/traces/receipts, and sends the ZIP to `C:\Users\albak\Downloads`.

**Architecture:** The Hermes parent acts as supervisor only. The CallScore Orchestrator owns the run, creates a Hermes-owned control plane under `/srv/agents/hermes/profiles/callscore/orchestrators/tmux-public-output-test/`, starts one tmux session, runs one channel workflow at a time by default (hard max 3), captures tmux panes/transcripts, and stores durable proof in files. Channel heads must produce real output artifacts and child-subagent receipts; they must not call public/provider mutation tools.

**Tech Stack:** Hermes CLI, tmux, CallScore canonical 51-agent runtime, LangGraph/Workplane dry-run surfaces, Node/Bun test commands where applicable, shell/Python packaging scripts, Composio read-only account checks only, Tailscale Taildrop.

---

## Task-router classification

Categories: orchestration, testing, social-media, media, email, safety, packaging, devops.

Primary skills:
- `orchestration/callscore-startup`
- `callscore-canonical-runtime`
- `orchestration/hermes-orchestrator`
- `callscore-autopilot`
- `social-media/callscore-social-posting-discipline`
- `media/youtube-content`
- `software-development/persistent-background-orchestration`
- `devops/tailscale-windows-download-zip`
- `software-development/parent-verification-of-agent-output`

Supporting skills:
- `research/last30days` for current discourse and non-generic hooks
- `marketing/callscore-marketing-engine`
- `commerce/art-of-war-operations`
- `devops/workplane-status`
- `mlops/langgraph-workplane`

## Hard constraints

- Test/dry-run only.
- No public publish.
- No provider/social mutation.
- No email, DM, newsletter, or outreach send.
- No Whop/payment/customer/provider mutation.
- No DB/deploy/infra/secret/destructive mutation.
- No direct parent provider calls. Provider readiness may be read-only; mutation must be blocked/receipted.
- No new agents. Use existing canonical 51-agent runtime/channel heads and child specialists.
- tmux is an execution container, not memory. Durable proof must be logs, traces, receipts, output artifacts, and package index.
- Default active cognitive lane is 1; hard max is 3.
- Each workflow must produce a reviewable output or an explicit blocked receipt for any unavailable media/video path.
- Every public-output candidate must include canonical operational package receipts or blocked receipts:
  - `editorial_angle_receipt.v1`
  - `platform_fit_receipt.v1`
  - `visual_brief_receipt.v1`
  - `visual_qa_receipt.v1`
  - `copy_visual_coherence_receipt.v1`
  - `same_shit_memory_receipt.v1`
- YouTube readiness additionally requires dry-run/blocked versions of:
  - `youtube_script_receipt.v1`
  - `youtube_packaging_receipt.v1`
  - `youtube_thumbnail_receipt.v1`
  - `youtube_publish_package_receipt.v1`
  - `youtube_analytics_receipt.v1`

## Canonical email identities

ZohoMail / Composio account is active. The workflow must use these identities only as follows:

- `community@call-score.com` — newsletters, community broadcasts, broad community communications. Not outbound human outreach.
- `noreply@call-score.com` — customer service/system no-reply identity. Not outbound human outreach.
- `sarah.collins@call-score.com` — canonical human outreach sender alias.
- `zoe.miller@call-score.com` — canonical human outreach sender alias.

Email test rule:
- Generate local draft artifacts only.
- Do not create/send live ZohoMail drafts unless a later explicit gate permits it.
- Outreach drafts must use `sarah.collins@call-score.com` or `zoe.miller@call-score.com` as `fromAddress`.
- Newsletter/community drafts must use `community@call-score.com`.
- Customer-service/system drafts must use `noreply@call-score.com`.
- If alias validation is uncertain, write `email_sender_alias_blocked.v1` and do not substitute silently.

## Required final ZIP contents

Package root:

```text
callscore-tmux-public-output-test-<timestamp>/
  README.md
  index.json
  SHA256SUMS
  run-manifest.json
  safety/
    mutation-scan.json
    credential-scan.json
    provider-mutation-flags.json
  orchestrator/
    tmux-session-manifest.json
    tmux-pane-captures/
    tmux-transcripts/
    supervisor.log
    orchestrator-trace.json
    canonical-audit.log
  channels/
    x/
      output.md
      artifacts.json
      trace.json
      receipts.json
      media/
      child-subagents/
    linkedin/
      output.md
      artifacts.json
      trace.json
      receipts.json
      media/
      child-subagents/
    youtube/
      output.md
      script.md
      packaging.json
      thumbnail-prompt.md
      media/
      trace.json
      receipts.json
      child-subagents/
    reddit/
      output.md
      artifacts.json
      trace.json
      receipts.json
      child-subagents/
    email/
      output.md
      drafts/
      sender-map.json
      trace.json
      receipts.json
      child-subagents/
  package/
    zip-receipt.json
    taildrop-transfer-receipt.json
```

## Workflow output requirements

### X / Twitter

Must include:
- platform-native single post or 4-8 tweet thread
- media plan
- rendered image if local render is available, otherwise blocked media receipt
- `growth_mechanics` block
- exact copy
- no-publish dry-run receipt
- child specialist proof

### LinkedIn

Must include:
- thought-leadership post text
- target entity/mention discipline block
- media/image/carousel plan
- rendered image or blocked media receipt
- `growth_mechanics` block
- exact copy
- no-publish dry-run receipt
- child specialist proof

### YouTube

Must include:
- concept/title/positioning
- script
- packaging metadata
- thumbnail prompt
- rendered thumbnail if local render is available, otherwise blocked thumbnail receipt
- video artifact if video backend is available, otherwise explicit video-generation blocked receipt
- no-publish dry-run receipt
- child specialist proof for script, packaging, thumbnail, publish-package, analytics

### Reddit / community

Must include:
- exact target surface: owned profile or specific subreddit candidate
- rules/fit receipt for non-owned community; owned-profile fit receipt otherwise
- platform-native title/body
- no-publish dry-run receipt
- child specialist proof

### Email

Must include:
- local newsletter/community draft from `community@call-score.com`
- local customer-service/system draft from `noreply@call-score.com`
- local human outreach drafts from `sarah.collins@call-score.com` and/or `zoe.miller@call-score.com`
- sender role map
- no-send receipt
- ZohoMail read-only account/readiness receipt
- child specialist proof

## Plan execution task list

### T0: Freeze baseline and validate plan prerequisites

**Objective:** Prove the repo/runtime baseline is safe before creating any tmux run.

**Files/artifacts:**
- Create: `/srv/agents/hermes/profiles/callscore/orchestrators/tmux-public-output-test/runs/<run-id>/baseline/`

**Commands:**
```bash
cd /opt/crypto-tuber-ranked
git status --short
git rev-parse --short HEAD
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
command -v tmux
```

**Acceptance:** clean or explicitly recorded dirty state; canonical audit passes with 51 agents; tmux available.

### T1: Create Hermes-owned tmux control plane

**Objective:** Create the durable run directory, tmux session manifest, run manifest, and lane queue.

**Files/artifacts:**
- Create: `/srv/agents/hermes/profiles/callscore/orchestrators/tmux-public-output-test/latest-run-dir.txt`
- Create: `run-manifest.json`
- Create: `tmux-session-manifest.json`
- Create: `lane-queue.json`

**Acceptance:** control-plane files live under the CallScore Hermes profile, not inside the repo; lane queue includes X, LinkedIn, YouTube, Reddit, Email, Package.

### T2: Start Orchestrator supervisor tmux session

**Objective:** Start a tmux session where the Orchestrator lane is visibly running and capturable.

**Commands:**
```bash
tmux new-session -d -s callscore-public-output-<run-id> -n orchestrator
```

**Acceptance:** tmux session exists; pane capture saved; supervisor log records launch.

### T3: Run X channel-head workflow

**Objective:** Launch the X channel head in tmux, require child specialist proof, and produce X public-output artifacts.

**Required children/proof:**
- discourse/angle child
- copy child
- visual/media child
- receipt/quality child

**Acceptance:** `channels/x/output.md`, `artifacts.json`, `trace.json`, `receipts.json`, media or blocked receipt, child-subagent proof all exist.

### T4: Run LinkedIn channel-head workflow

**Objective:** Launch the LinkedIn channel head in tmux, require child specialist proof, and produce LinkedIn thought-leadership artifacts.

**Required children/proof:**
- discourse/angle child
- platform-fit child
- copy child
- visual/media child
- receipt/quality child

**Acceptance:** `channels/linkedin/output.md`, `artifacts.json`, `trace.json`, `receipts.json`, media or blocked receipt, child-subagent proof all exist.

### T5: Run YouTube channel-head workflow

**Objective:** Launch the YouTube production head in tmux, require production-cluster child proof, and produce YouTube review package.

**Required children/proof:**
- `callscore-youtube-script-agent`
- `callscore-youtube-packaging-agent`
- `callscore-youtube-thumbnail-agent`
- `callscore-youtube-publishing-agent` dry-run only
- `callscore-youtube-analytics-agent` readiness/placeholder only

**Acceptance:** `script.md`, `packaging.json`, thumbnail prompt/render/blocker, video artifact or video blocked receipt, YouTube receipts all exist.

### T6: Run Reddit/community channel-head workflow

**Objective:** Launch Reddit/community workflow in tmux and produce platform-native discussion artifacts with no publish.

**Required children/proof:**
- community fit/rules child
- copy child
- safety/policy child
- receipt child

**Acceptance:** target surface, title/body, rules/fit receipt, no-publish receipt, child proof all exist.

### T7: Run Email channel-head workflow

**Objective:** Launch email workflow in tmux and produce local-only drafts with correct sender identity roles.

**Required children/proof:**
- newsletter/community child
- customer-service/system child
- human outreach child
- sender-policy verifier child

**Acceptance:** local draft artifacts exist; no-send receipt exists; sender-role map enforces community/noreply/Sarah/Zoe roles; no Zoho send occurred.

### T8: Parent-verify tmux/channel proof

**Objective:** Verify every channel head and child specialist actually ran or wrote a concrete blocked receipt.

**Verification:**
- inspect tmux transcripts/pane captures
- parse every `trace.json`
- parse every `receipts.json`
- verify child-subagent files are non-empty and tied to the channel

**Acceptance:** no channel can pass from logs alone; every channel has visible output plus proof.

### T9: Run safety and mutation scans

**Objective:** Prove the test run did not publish, send, mutate providers, touch DB/deploy/infra, or leak secrets.

**Artifacts:**
- `safety/mutation-scan.json`
- `safety/credential-scan.json`
- `safety/provider-mutation-flags.json`

**Acceptance:** all mutation flags false; secret scan passes or findings are redacted and blocker-classified.

### T10: Build README, index, and SHA manifest

**Objective:** Make the package reviewable without opening every file.

**Artifacts:**
- `README.md`
- `index.json`
- `SHA256SUMS`

**Acceptance:** index reports file counts by channel, booleans for text/image/video/blocked receipts, and hashes.

### T11: Create and verify ZIP

**Objective:** Build the inspection ZIP and verify it is structurally valid.

**Commands:**
```bash
cd /srv/agents/hermes/profiles/callscore/orchestrators/tmux-public-output-test/runs
zip -qr callscore-tmux-public-output-test-<run-id>.zip callscore-tmux-public-output-test-<run-id>
unzip -t callscore-tmux-public-output-test-<run-id>.zip
sha256sum callscore-tmux-public-output-test-<run-id>.zip
```

**Acceptance:** zip test passes; SHA256 recorded in sidecar receipt.

### T12: Taildrop ZIP to Windows Downloads

**Objective:** Send the final ZIP to Omar’s Windows Downloads folder.

**Target:** `C:\Users\albak\Downloads\callscore-tmux-public-output-test-<run-id>.zip`

**Commands:**
```bash
tailscale file cp --name callscore-tmux-public-output-test-<run-id>.zip \
  /srv/agents/hermes/profiles/callscore/orchestrators/tmux-public-output-test/runs/callscore-tmux-public-output-test-<run-id>.zip \
  omarslaptop:
```

**Acceptance:** Taildrop exits 0; transfer receipt records source SHA, target path, and remote-checksum status.

### T13: Final report

**Objective:** Report only the package path, Windows target path, SHA256, receipt path, and any blocked media/video lanes.

**Acceptance:** terse final response; no “ready” claim without actual artifacts and transfer receipt.

## Non-goals

- Do not wire new production runtime behavior.
- Do not add new canonical agents.
- Do not publish anything.
- Do not send emails/newsletters/DMs.
- Do not run migrations, deploys, service restarts, or DB writes.
- Do not claim image/video exists unless actual files are present in the package.

## Current status

This document is the plan. Execution has not begun yet.
