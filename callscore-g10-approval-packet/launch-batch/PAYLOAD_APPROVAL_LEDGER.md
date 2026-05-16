# Launch Batch Payload Approval Ledger

**Status:** POPULATED_WITH_DRAFT_HASHES — no exact payload approvals recorded.  
**Purpose:** record exact artifact payload hashes, targets, gates, Hermes approval IDs, and operator decisions for any controlled launch action.

## Approval ledger

| Item | Action class | Target | Payload hash | Required gates | Hermes approval IDs | Operator status | Notes |
|---|---|---|---|---|---|---|---|
| creator scorecard 1 | publish | `{"destination":"public_site","path":"/creators/creator_alpha/scorecard"}` | `sha256:054832afcd0744dd29056346053486fb8b6b9c8f756dcef982619ff1fa66c49f` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator SEO page 1 | publish | `{"destination":"public_site","path":"/creators/creator_alpha"}` | `sha256:24f901ec41085fd1930952429fd09bae9d1d281b1742a05d96fa645529564d65` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator scorecard 2 | publish | `{"destination":"public_site","path":"/creators/creator_bravo/scorecard"}` | `sha256:108162a54e1366ebe41629cece5a8feebb59a490d9cc43948e2c1f24a698b357` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator SEO page 2 | publish | `{"destination":"public_site","path":"/creators/creator_bravo"}` | `sha256:c8394b04959ff9dd7c79c2d2189fae7f0176ff412b4d85fda099e0c0a8dafe92` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator scorecard 3 | publish | `{"destination":"public_site","path":"/creators/creator_charlie/scorecard"}` | `sha256:1f787ab3dffa560f2bb6ea08dd205a487b621f23b028716eb209d3a661d81a68` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator SEO page 3 | publish | `{"destination":"public_site","path":"/creators/creator_charlie"}` | `sha256:cb2c359bc31400e84e78b816901bfa63434d9291d4600cc2b80b8f5827e4f102` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator scorecard 4 | publish | `{"destination":"public_site","path":"/creators/creator_delta/scorecard"}` | `sha256:001f0e3e87247656aec15025d7ed40919a781344ae58379d20ad9c576cd3d644` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator SEO page 4 | publish | `{"destination":"public_site","path":"/creators/creator_delta"}` | `sha256:aee4edd3982ae2dabc3de829c43e95bc77c30cb887ee41fbb3b087d0d061ae50` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator scorecard 5 | publish | `{"destination":"public_site","path":"/creators/creator_echo/scorecard"}` | `sha256:ce25c66fd4081f73e5b0c6606ee68385db2814c8ae581910fd4a45d1648c87a8` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| creator SEO page 5 | publish | `{"destination":"public_site","path":"/creators/creator_echo"}` | `sha256:d5e3038dda1a95b64083fd3b172d274962fc497cbd8e2b72319031cdb347d638` | TRUST_GATE, DATA_POLICY_GATE, RIGHT_OF_REPLY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| weekly digest | send | `{"audience":"digest_subscribers"}` | `sha256:afed94599f60f7784a0b61a6b40db0391db7a59e1ed45e083d7459182fabcecc` | TRUST_GATE, DATA_POLICY_GATE, SEND_GATE | TBD | PENDING | Draft only; no approval recorded. |
| methodology page | publish | `{"destination":"public_site","path":"/methodology"}` | `sha256:16cc034d8a5212708fbc4e3ad24661479efa635c977a4ae292644c93473d5ddb` | TRUST_GATE, DATA_POLICY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| correction log page | publish | `{"destination":"public_site","path":"/corrections"}` | `sha256:52f5209a8cef7a5cf0ab9f47e5dbf229c8538a70ae0b9dfc85e840d6bbba7cdb` | TRUST_GATE, DATA_POLICY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |
| GitHub methodology repo draft | publish | `{"destination":"github","repo":"binarybaron/callscore-methodology","branch":"draft-controlled-launch"}` | `sha256:22f0bcb4bc7f41fff8cf307865a93bca30c21cf992cca9ea5ca15fbed5fa2ede` | TRUST_GATE, DATA_POLICY_GATE, PUBLISH_GATE | TBD | PENDING | Draft only; no approval recorded. |

## Validation rules

- `Payload hash` must be `sha256:<64 hex chars>` and must match the exact reviewed artifact/action payload.
- `Target` must be the exact destination approved by the operator.
- `Hermes approval IDs` must cover every required gate for the action.
- Any content, target, action, workflow, runtime, evidence, gate, or methodology drift requires reapproval.
