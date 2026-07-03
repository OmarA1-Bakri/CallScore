# CallScore tmux channel-head public-output test plan

Goal: initiate the CallScore Orchestrator so it creates a tmux execution environment, runs each channel workflow independently, visibly spins up the channel-head subagents and their child subagents, and packages reviewable public-output artifacts for Omar in Windows Downloads.

Mode: test / dry-run / no-provider-mutation.

Hard constraints:
- No public publishing.
- No provider/social mutation.
- No email/DM/newsletter send.
- No Whop/payment/customer/provider mutation.
- No DB/deploy/infra/secret/destructive mutation.
- No direct parent-provider calls; graph-owned dry-run/preflight only.
- tmux is an execution container, not memory; durable proof must be logs/traces/receipts/artifacts.
- Default concurrency 1; hard cap 3 cognitive channel lanes.

Canonical email-agent identities for ZohoMail / Composio:
- community@call-score.com
- noreply@call-score.com
- sarah.collins@call-score.com
- zoe.miller@call-score.com

Composio evidence:
- Toolkit `zoho_mail` is active in Composio.
- Relevant tools discovered: `ZOHO_MAIL_ACCOUNTS_LIST_ACCOUNTS`, `ZOHO_MAIL_MESSAGES_CREATE_DRAFT`, `ZOHO_MAIL_MESSAGES_SEND_EMAIL`, `ZOHO_MAIL_MESSAGES_REPLY_TO_EMAIL`.
- In this test run, email workflow may create local draft artifacts and ZohoMail account/readiness receipts only. It must not send email.
- The email child agent must choose a canonical sender identity from the list above and record it in its output packet.
- If Zoho account aliases do not allow a selected `fromAddress`, write `email_sender_alias_blocked.v1` instead of sending or substituting silently.

Required channel workflows and outputs:

1. Orchestrator brief
   - tmux session manifest
   - child-lane launch plan
   - canonical 51-agent audit
   - trace/receipt proving bounded execution

2. X / Twitter owned-public workflow
   - platform-native post or thread text
   - image/video plan and rendered media if available
   - visual brief, visual QA, copy/visual coherence receipt
   - no-publish dry-run receipt

3. LinkedIn owned-public workflow
   - thought-leadership post text
   - media/image/carousel asset or blocked media receipt
   - target entity / mention discipline block
   - no-publish dry-run receipt

4. YouTube workflow
   - video concept
   - script
   - packaging metadata
   - thumbnail prompt/rendered thumbnail if available
   - video artifact if video backend is available; otherwise explicit blocked video-generation receipt
   - YouTube production receipts: script, packaging, thumbnail, publish-package dry-run, analytics placeholder/readiness

5. Reddit/community workflow
   - platform-native post text
   - subreddit/profile fit and rules receipt
   - no-publish dry-run receipt

6. Email workflow
   - local draft artifacts for each relevant persona/lane as needed
   - selected canonical sender identity from:
     - community@call-score.com
     - noreply@call-score.com
     - sarah.collins@call-score.com
     - zoe.miller@call-score.com
   - ZohoMail Composio account/readiness receipt
   - no-send receipt

7. Final package workflow
   - collect tmux transcripts/pane captures
   - collect channel outputs, media, receipts, traces, logs
   - index all files with hashes
   - secret scan and mutation scan
   - zip, verify, Taildrop to `C:\Users\albak\Downloads`

Acceptance criteria:
- Each workflow has an `output.md`, `artifacts.json`, `receipts.json`, and `trace.json`.
- Every channel has visible content output; missing media/video is represented by explicit blocked receipt, not omitted silently.
- tmux logs prove channel heads and child subagents were launched or a concrete launch blocker was recorded.
- Email workflow includes the four canonical ZohoMail sender identities exactly as above.
- Final ZIP contains text, image/video artifacts where available, receipts/logs/traces, and package index.
