# CallScore canonical env manifest

Last updated: 2026-06-15

Canonical local env source: `/opt/crypto-tuber-ranked/.env.hermes`.

Secret rule: this manifest lists key names only. It never records values, tokens, cookies, DB URLs, auth headers, or private keys.

## Status

- Canonical env exists: yes
- Permissions: `600`
- Gitignored: yes
- Required missing keys: `none`
- Optional missing / Composio-managed keys: `HH_READ_API_BASE, HH_READ_SECRET, HH_READ_API_HOST, HH_READ_API_PORT, HH_ENQUEUE_HOST, HH_ENQUEUE_PORT, PIPELINE_STATUS_SECRET, REVIEW_ACCESS_TOKEN, WHOP_WEBHOOK_KEY, RESEND_FROM_EMAIL, POSTHOG_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_HOST, LINKEDIN_ACCESS_TOKEN, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, HUGGINGFACE_TOKEN, HF_TOKEN`
- Compatibility pointers created: `/srv/agents/hermes/.env`, `/home/omar/.config/x-cli/.env`, `/srv/whop-auto/plugin/agent_workflows/whop_auto/.env.hetzner` now resolve to canonical `.env.hermes`; timestamped backups preserved locally with `600` permissions.
- Stale Whop workspace env files were not deleted or symlinked; provider-capable Whop key names were copied into canonical env for safe checks, and cleanup/rotation remains separate approval.

## Sources inspected

| Source id | Path | Used | Notes |
| --- | --- | --- | --- |
| `canonical_existing` | `/opt/crypto-tuber-ranked/.env.hermes` | yes | values copied locally without printing |
| `hermes_env` | `/srv/agents/hermes/.env (now symlink to canonical; backup preserved)` | yes | values copied locally without printing |
| `x_cli` | `/home/omar/.config/x-cli/.env (now symlink to canonical; backup preserved)` | yes | values copied locally without printing |
| `whop_provider` | `/srv/whop-auto/workspace/crypto-tuber-ranked/.env.production (stale workspace provider context; copied key names only into canonical)` | yes | values copied locally without printing |
| `whop_auto` | `/srv/whop-auto/plugin/agent_workflows/whop_auto/.env.hetzner (now symlink to canonical; backup preserved)` | yes | values copied locally without printing |
| `codex_composio` | `/home/omar/.codex/config.toml [mcp_servers.composio] header (value copied locally; not printed)` | yes | values copied locally without printing |
| `canonical_policy` | `generated canonical path/value policy` | yes | values copied locally without printing |
| `canonical_alias` | `generated alias from existing canonical local value` | no | reference/policy only |

## Key manifest

### CallScore app/runtime

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `CALLSCORE_APP_DIR` | required | CallScore app/runtime | `canonical_policy` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `CALLSCORE_ENV_FILE` | required | CallScore app/runtime | `canonical_policy` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `DATABASE_PROVIDER` | required | CallScore app/runtime | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `DATABASE_URL` | required | CallScore app/runtime | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `POSTGRES_URL` | optional | CallScore app/runtime | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `NEXT_PUBLIC_BASE_URL` | optional | CallScore app/runtime | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `SESSION_SECRET` | optional | CallScore app/runtime | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `CRON_SECRET` | required | CallScore app/runtime | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `PIPELINE_STATUS_SECRET` | optional | CallScore app/runtime | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `REVIEW_ACCESS_TOKEN` | optional | CallScore app/runtime | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |

### HH PostgreSQL / HH Read API

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_PROVIDER` | required | HH PostgreSQL / HH Read API | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `DATABASE_URL` | required | HH PostgreSQL / HH Read API | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `POSTGRES_URL` | optional | HH PostgreSQL / HH Read API | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `HH_READ_API_BASE` | optional | HH PostgreSQL / HH Read API | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `HH_READ_SECRET` | optional | HH PostgreSQL / HH Read API | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `HH_READ_API_HOST` | optional | HH PostgreSQL / HH Read API | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `HH_READ_API_PORT` | optional | HH PostgreSQL / HH Read API | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |

### Workplane/Hermes

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `HERMES_WORKER_ID` | required | Workplane/Hermes | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `HH_ENQUEUE_SECRET` | required | Workplane/Hermes | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `HH_ENQUEUE_HOST` | optional | Workplane/Hermes | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `HH_ENQUEUE_PORT` | optional | Workplane/Hermes | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `ANTHROPIC_API_KEY` | optional | Workplane/Hermes | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ANTHROPIC_TOKEN` | optional | Workplane/Hermes | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `GITHUB_TOKEN` | optional | Workplane/Hermes | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `NETLIFY_AUTH_TOKEN` | optional | Workplane/Hermes | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `NETLIFY_SITE_ID` | optional | Workplane/Hermes | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Transcript laptop bridge

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `YTDLP_BIN` | required | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_COOKIES_PATH` | required | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_COOKIES` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_COOKIES_FROM_BROWSER` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_JS_RUNTIMES` | optional | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_PLAYER_CLIENT` | optional | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_PO_TOKEN_PROVIDER` | optional | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `YTDLP_PO_TOKEN_BROWSER_PATH` | optional | Transcript laptop bridge | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `TRANSCRIPT_BATCH_LIMIT` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `TRANSCRIPT_CONCURRENCY` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `TRANSCRIPT_RETRY_COOLDOWN_HOURS` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `TRANSCRIPT_STALE_RETRY_DAYS` | optional | Transcript laptop bridge | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Whop Auto

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `WHOP_AUTO_UID` | optional | Whop Auto | `whop_auto` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_AUTO_GID` | optional | Whop Auto | `whop_auto` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_AUTO_SECRET_DIR` | optional | Whop Auto | `whop_auto` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_AUTO_STATE_DIR` | optional | Whop Auto | `whop_auto` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_AUTO_WORKSPACE_DIR` | optional | Whop Auto | `whop_auto` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_API_KEY` | required | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_CLIENT_ID` | required | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_CLIENT_SECRET` | required | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_COMPANY_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_WEBHOOK_KEY` | optional | Whop Auto | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `NEXT_PUBLIC_WHOP_APP_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_PRO_PRODUCT_ID` | required | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_ALPHA_PRODUCT_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_FREE_PRODUCT_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_PRO_PLAN_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_ALPHA_PLAN_ID` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_CHECKOUT_URL_PRO_MONTHLY` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `WHOP_CHECKOUT_URL_ALPHA_MONTHLY` | optional | Whop Auto | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Art of War

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `X_API_KEY` | required | Art of War | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_API_SECRET` | required | Art of War | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_ACCESS_TOKEN` | required | Art of War | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_ACCESS_TOKEN_SECRET` | required | Art of War | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_BEARER_TOKEN` | optional | Art of War | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `TELEGRAM_BOT_TOKEN` | optional | Art of War | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `DISCORD_BOT_TOKEN` | optional | Art of War | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `RESEND_API_KEY` | optional | Art of War | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ATTIO_API_KEY` | optional | Art of War | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Composio MCP

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `COMPOSIO_API_KEY` | required | Composio MCP | `codex_composio` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `COMPOSIO_MCP_URL` | required | Composio MCP | `codex_composio` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### X/Twitter

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `X_API_KEY` | required | X/Twitter | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_API_SECRET` | required | X/Twitter | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_ACCESS_TOKEN` | required | X/Twitter | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_ACCESS_TOKEN_SECRET` | required | X/Twitter | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `X_BEARER_TOKEN` | optional | X/Twitter | `x_cli` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Gmail/email

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | optional | Gmail/email | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `RESEND_FROM_EMAIL` | optional | Gmail/email | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed |
| `GMAIL_CLIENT_ID` | optional | Gmail/email | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |
| `GMAIL_CLIENT_SECRET` | optional | Gmail/email | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |

### PostHog

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `POSTHOG_API_KEY` | optional | PostHog | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |
| `POSTHOG_PROJECT_ID` | optional | PostHog | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |
| `POSTHOG_HOST` | optional | PostHog | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |

### Attio

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `ATTIO_API_KEY` | optional | Attio | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### LinkedIn

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `LINKEDIN_ACCESS_TOKEN` | optional | LinkedIn | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |

### Discord

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `DISCORD_BOT_TOKEN` | optional | Discord | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `DISCORD_ALLOWED_USERS` | optional | Discord | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Hugging Face

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `HUGGINGFACE_TOKEN` | optional | Hugging Face | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |
| `HF_TOKEN` | optional | Hugging Face | `not discovered` | no | `node --import tsx scripts/validate-hermes-env.ts` | optional missing or Composio-managed; current lane expected through Composio unless direct local tooling needs native token |

### Netlify/public verification

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `NETLIFY_AUTH_TOKEN` | optional | Netlify/public verification | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `NETLIFY_SITE_ID` | optional | Netlify/public verification | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `NEXT_PUBLIC_BASE_URL` | optional | Netlify/public verification | `whop_provider` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

### Local Ollama/Gemma/Qwen

| Key name | Required | Owning lane | Source discovered | Present in `.env.hermes` | Validation method | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `OLLAMA_HOST` | required | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `OLLAMA_BASE_URL` | optional | Local Ollama/Gemma/Qwen | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `OLLAMA_API_KEY` | optional | Local Ollama/Gemma/Qwen | `hermes_env` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `OLLAMA_TOKEN` | optional | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ML_VERIFIER_PROVIDER` | optional | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ML_VERIFIER_MODEL` | optional | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ML_VERIFIER_PROMPT_VERSION` | optional | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |
| `ML_VERIFIER_TIMEOUT_MS` | optional | Local Ollama/Gemma/Qwen | `canonical_existing` | yes | `node --import tsx scripts/validate-hermes-env.ts` | - |

## Conflict policy

- Duplicate conflicting values are not printed and are not guessed silently.
- Current consolidation found no selected-key conflicts after excluding defunct Neon/Vercel production keys.
- Defunct `NEON_*` and `VERCEL_*` production env keys are intentionally excluded from canonical `.env.hermes`.

## 2026-06-15 Composio connected-app read-only inventory

Read-only connection listing through Composio reported all seven canonical app toolkits active. Account IDs, emails, user names, token scopes, and other private metadata are intentionally omitted from this manifest.

| App / toolkit | Status | Env relationship | Allowed current use |
| --- | --- | --- | --- |
| Attio | READY | Routed through Composio canonical MCP config in `.env.hermes`; direct native key also present where discovered | Read-only inventory unless CRM write gate exists |
| Gmail/email | READY | Routed through Composio; no direct Gmail native key required for current lane | Draft/read-only only; sends remain `SEND_GATE` |
| Twitter/X | READY | Routed through Composio plus canonical X native keys for owned fallback tooling | Owned public organic execution allowed under `READY_PUBLIC_OWNED`; DMs/outreach/paid remain gated |
| PostHog | READY | Routed through Composio; direct native key not required for current lane | Read-only monitoring only |
| Hugging Face | READY | Routed through Composio; direct native key optional/non-core | Read-only/model-tooling only unless lane approved |
| LinkedIn | READY | Routed through Composio; direct native key not required for current lane | Owned organic posting only under `READY_PUBLIC_OWNED`; DMs/outreach/paid remain gated |
| Discord | READY | Routed through Composio plus Discord bot env where discovered | Owned/managed community posts only under `READY_PUBLIC_OWNED`; DMs/non-owned communities remain gated |
