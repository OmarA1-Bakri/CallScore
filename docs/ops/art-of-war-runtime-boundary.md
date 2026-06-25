# Art of War Runtime Boundary

CallScore app source must not contain Art of War live runtime state.

Canonical Art of War runtime/control-plane state lives outside this app checkout, normally at:

`/srv/agents/repos/Claude_Code_Automations/art-of-war`

The app operating graph may read that runtime as external context for `revenue_now`, but must not copy or mutate it during O13.

## Keep outside app repo

- `art-of-war/live/**`
- kill switches
- activation/preflight state
- dashboard event logs/output
- generated packets
- runtime receipts
- queue/state snapshots
- provider/control-plane status

## Eligible for app repo only when reusable source

- TypeScript/Python source modules that are product code
- schemas/templates used by app code
- concise docs explaining app/control boundary
- tests for app-side wrappers

## O13 integration rule

`revenue_now` may consume external Art of War context and must block precisely when unavailable or unsafe:

- `art_of_war_runtime_not_available`
- `art_of_war_kill_switch_missing`
- `art_of_war_kill_switch_engaged`
- `art_of_war_preflight_failed`

No external mutation. No runtime restore into `/opt/crypto-tuber-ranked/art-of-war`.
