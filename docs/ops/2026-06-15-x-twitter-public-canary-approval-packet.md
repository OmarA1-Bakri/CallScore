# X/Twitter public canary execution packet — CallScore

Generated: 2026-06-15T10:52:25Z
Channel: X / Twitter only
Status: publishable under READY_PUBLIC_OWNED; not yet published in this patch run
Campaign ID: callscore-x-public-canary-approval-packet
Art of War evidence: /tmp/callscore-x-canary-artofwar.json

## Safety boundary

This packet is now reclassified under the 2026-06-15 default-public policy. It authorizes owned CallScore X/Twitter organic publication when executed by Hermes on the owned/managed CallScore/Omar account, zero-cost, with the exact payload/destination below, no DM/outreach, no paid boost/API, no provider/account mutation, no Whop/customer/payment/pricing mutation, no secrets, and post-execution receipt written immediately after publish.

Registry row: X / Twitter
Owner: marketing-channel-growth
Provider: Composio Twitter/X
Current status: ready_public_owned
Gate status: ready_public_owned
Required gate: READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE
Required receipt: post-execution public GTM receipt with payload hash, destination, provider response/post URL when available, rollback path, and monitoring plan
Receipt path pattern: .tmp/workflow-receipts/artofwar_owned_public_execution/<run-id>.json
Rollback path: after live post, delete/retract post if needed and record correction/rollback receipt.

Still forbidden without explicit approval receipt:

- DM
- paid boost or paid API use
- provider/account mutation
- secret/env/token/cookie exposure
- Whop/customer/payment/pricing mutation

## Task-router routing

Categories: sales, social, marketing, compliance, governance
Primary skills used: art-of-war-operations, callscore-autopilot, humanizer, xurl safety rules
Execution mode: default-public owned X canary; no live post performed during this patch run

## Primary post copy

```text
Crypto is loud. CallScore is a quieter way to check who was right.

It ranks crypto creators by evidence: their calls, claims, transcripts, and what happened after.

Use it to separate signal from noise before you trust another thread.

https://call-score.com
```

Character count: 259
Payload SHA-256: 6be1a693803db3fd746d06017449a2104ecbc1f9345f2c5a7739c0b7db2e3f42

## Default-public classification

Publishable under default-public policy: yes.

Reason: owned CallScore X/Twitter organic post; zero-cost; no DM/email/outreach; no paid boost/API; no provider/account mutation; no Whop/customer/payment/pricing mutation; no named creator accusation; no investment advice; no performance guarantee; no private data; safe canonical URL.

Payload hash: `6be1a693803db3fd746d06017449a2104ecbc1f9345f2c5a7739c0b7db2e3f42`.

Execution receipt path: `.tmp/workflow-receipts/artofwar_owned_public_execution/callscore-x-public-canary-20260615.json`.

## Alternate post variant 1

```text
Most crypto creator rankings reward attention.

CallScore ranks evidence.

It reads creator calls, transcripts, claims, and outcomes, then shows who has actually been useful over time.

Public app: https://call-score.com
```

Character count: 220
Payload SHA-256: 87332d6661653f68a38e9643d73b75f0715eaa445d408c32b3fb48e9748b300d

## Alternate post variant 2

```text
Before you trust another crypto prediction, check the track record.

CallScore turns creator calls and transcripts into evidence-backed rankings.

Less hype. More receipts.

https://call-score.com
```

Character count: 196
Payload SHA-256: 502bc2ce6fab3020a4b1f5c3edfeb747f6909d52b9fbdfe6cda10feabe1ca2ca

## Sharper founder-style variant

```text
I got tired of crypto creators being judged by confidence instead of accuracy.

So we built CallScore: creator rankings based on calls, transcripts, claims, and outcomes.

No vibes leaderboard. Evidence.

https://call-score.com
```

Character count: 227
Payload SHA-256: 91698254d1fc7347c15c0e590067f416a54e2637f6d2157f27d9f7a78c90d8a6

## Target audience

- Crypto users who follow influencers but distrust hype cycles.
- Traders and researchers who want creator track records before acting on calls.
- Skeptical crypto Twitter readers who respond to proof, not generic launch copy.

## Hook rationale

The hook starts from a familiar pain: crypto is noisy and creator confidence often outruns evidence. The copy avoids naming or attacking any creator. It frames CallScore as a tool for checking track records, not as a judge handing down verdicts.

## Call-to-action

Visit the public app and inspect the creator leaderboard.

CTA URL: https://call-score.com

## Landing URL

https://call-score.com

## UTM suggestion

Use this URL only when the approved payload explicitly includes UTM tracking:

```text
https://call-score.com/?utm_source=x&utm_medium=social&utm_campaign=controlled_full_public_canary_20260615&utm_content=primary_evidence_not_hype
```

Do not add or change tracking in a live post unless the approved receipt includes the exact final URL.

## Expected user reaction

Likely positive reactions:

- Curiosity from users tired of personality-driven crypto calls.
- Replies asking how CallScore calculates rankings.
- Clicks from people wanting to check whether specific creators are listed.

Likely negative or skeptical reactions:

- Creators or fans may challenge methodology.
- Users may ask whether rankings are current enough.
- Some may interpret "who was right" as adversarial.

Prepared response posture: explain methodology neutrally. Do not argue with creators. Do not make unsupported claims about any named creator in replies.

## Risk and compliance lint

Result: pass for owned public organic execution under READY_PUBLIC_OWNED.

Checks:

- No named creator claims.
- No investment advice.
- No performance guarantee.
- No defamatory wording.
- No promise that CallScore predicts future returns.
- No paid spend.
- No DM/email/community send.
- No Whop/payment/pricing/customer mutation.
- No provider/account mutation.
- No secret-bearing content.

Risk notes:

- "who was right" is plain-language but can feel adversarial. Primary copy keeps it softer with "check who was right" and "separate signal from noise."
- The founder-style variant is sharper and may drive more engagement, but it carries more reputational edge. Use it only if Omar wants a founder-led tone.
- If replies ask for specific creator judgments, route to public pages/methodology. Do not improvise unsupported accusations.

## Rollback/delete instruction

If this post is published, rollback is:

1. Delete the X/Twitter post through the approved provider/tooling path.
2. Capture delete receipt with original post ID, deletion timestamp, operator, reason, and provider response.
3. If the post already drew material engagement or confusion, prepare a correction reply/post for separate approval. Do not publish correction without its own approval receipt unless the original approval explicitly included this rollback language.
4. Append rollback receipt under `.tmp/workflow-receipts/artofwar_publish_rollback/<run-id>.json` or the active registry-approved rollback path.

## Post-publication monitoring plan

Timebox: first 24 hours after approved publication.

Metrics to check:

- Post URL and ID exist.
- Impressions, likes, reposts, bookmarks, replies, profile clicks, and link clicks if available through the approved provider surface.
- Replies containing methodology questions.
- Replies alleging wrong data, stale rankings, or unfair creator treatment.
- Any request for creator-specific evidence.
- Any sign the post is being interpreted as investment advice.

Monitoring cadence:

- T+15 minutes: confirm post live and link works.
- T+1 hour: inspect replies and basic engagement.
- T+4 hours: inspect methodology/risk replies.
- T+24 hours: summarize outcome, click/engagement if available, and recommendation for next canary.

Allowed monitoring actions:

- read-only metrics and replies
- draft response recommendations
- draft correction packet if needed

Forbidden monitoring actions without separate approval:

- replies
- likes/reposts
- DMs
- paid boosts
- account/profile changes
- deleting the post unless rollback approval path applies

## Post-execution receipt template

Save exact post-execution receipt to:

```text
/opt/crypto-tuber-ranked/.tmp/workflow-receipts/artofwar_owned_public_execution/callscore-x-public-canary-20260615.json
```

Template:

```json
{
  "schema": "callscore.owned_public_execution_receipt.v1",
  "executed": true,
  "executed_at": "<ISO-8601 timestamp>",
  "executed_by": "Hermes/OMX operator",
  "channel": "X / Twitter",
  "provider": "Composio Twitter/X or xurl, whichever execution path is explicitly approved",
  "destination_account": "<exact X account/handle>",
  "campaign_id": "callscore-x-public-canary-approval-packet",
  "selected_variant": "primary",
  "payload_sha256": "6be1a693803db3fd746d06017449a2104ecbc1f9345f2c5a7739c0b7db2e3f42",
  "payload_text": "Crypto is loud. CallScore is a quieter way to check who was right.\n\nIt ranks crypto creators by evidence: their calls, claims, transcripts, and what happened after.\n\nUse it to separate signal from noise before you trust another thread.\n\nhttps://call-score.com",
  "landing_url": "https://call-score.com",
  "utm_url": "https://call-score.com/?utm_source=x&utm_medium=social&utm_campaign=controlled_full_public_canary_20260615&utm_content=primary_evidence_not_hype",
  "required_gates": [
    "READY_PUBLIC_OWNED",
    "PUBLIC_MESSAGING_POLICY",
    "POST_EXECUTION_RECEIPT",
    "SECRET_GATE"
  ],
  "forbidden_actions_confirmed": [
    "no_dm",
    "no_paid_spend",
    "no_paid_api",
    "no_whop_mutation",
    "no_customer_payment_pricing_mutation",
    "no_secret_exposure"
  ],
  "rollback_instruction": "Delete/retract post and record rollback receipt if the approved post causes material confusion, policy risk, unsupported claim risk, or operator requests rollback.",
  "post_publication_monitoring_plan": "Read-only monitoring at T+15m, T+1h, T+4h, T+24h; draft responses only unless separately approved.",
  "execution_command": "xurl post <exact payload text>",
  "post_url_or_id": "<provider response post id/url>"
}
```

## Exact execution action

Pre-approval is no longer required for this owned organic post. Before executing, confirm the destination is the owned/managed CallScore/Omar X account and run validation:

```bash
cd /opt/crypto-tuber-ranked
python3 -m json.tool .tmp/workflow-receipts/artofwar_owned_public_execution/callscore-x-public-canary-20260615.json >/tmp/callscore-x-canary-approval.validated.json
node --import tsx --test tests/gtm-agent-registry.test.ts tests/workflow-receipts.test.ts tests/workplane-jobs.test.ts
```

Publish command for Hermes when live execution mode is invoked:

```bash
xurl post "Crypto is loud. CallScore is a quieter way to check who was right.

It ranks crypto creators by evidence: their calls, claims, transcripts, and what happened after.

Use it to separate signal from noise before you trust another thread.

https://call-score.com"
```

Immediately save the provider response/post URL or ID into `.tmp/workflow-receipts/artofwar_owned_public_execution/callscore-x-public-canary-20260615.json`, then run read-only monitoring.

## Final status

READY_PUBLIC_OWNED execution packet ready.
Public action performed in this patch run: no.
External mutation performed: no.
Paid action performed: no.
Whop/customer/payment/pricing mutation performed: no.
Secrets exposed: no.
