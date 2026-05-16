# First Controlled Launch Batch Draft Manifest

Status: draft only. No publication approved.

## Draft artifacts

| Item | Draft path | Action class | Target | Payload hash | Approval status |
|---|---|---|---|---|---|
| creator scorecard 1 | `drafts/scorecard_1.json` | publish | `{"destination":"public_site","path":"/creators/creator_alpha/scorecard"}` | `sha256:054832afcd0744dd29056346053486fb8b6b9c8f756dcef982619ff1fa66c49f` | PENDING |
| creator SEO page 1 | `drafts/creator_page_1.json` | publish | `{"destination":"public_site","path":"/creators/creator_alpha"}` | `sha256:24f901ec41085fd1930952429fd09bae9d1d281b1742a05d96fa645529564d65` | PENDING |
| creator scorecard 2 | `drafts/scorecard_2.json` | publish | `{"destination":"public_site","path":"/creators/creator_bravo/scorecard"}` | `sha256:108162a54e1366ebe41629cece5a8feebb59a490d9cc43948e2c1f24a698b357` | PENDING |
| creator SEO page 2 | `drafts/creator_page_2.json` | publish | `{"destination":"public_site","path":"/creators/creator_bravo"}` | `sha256:c8394b04959ff9dd7c79c2d2189fae7f0176ff412b4d85fda099e0c0a8dafe92` | PENDING |
| creator scorecard 3 | `drafts/scorecard_3.json` | publish | `{"destination":"public_site","path":"/creators/creator_charlie/scorecard"}` | `sha256:1f787ab3dffa560f2bb6ea08dd205a487b621f23b028716eb209d3a661d81a68` | PENDING |
| creator SEO page 3 | `drafts/creator_page_3.json` | publish | `{"destination":"public_site","path":"/creators/creator_charlie"}` | `sha256:cb2c359bc31400e84e78b816901bfa63434d9291d4600cc2b80b8f5827e4f102` | PENDING |
| creator scorecard 4 | `drafts/scorecard_4.json` | publish | `{"destination":"public_site","path":"/creators/creator_delta/scorecard"}` | `sha256:001f0e3e87247656aec15025d7ed40919a781344ae58379d20ad9c576cd3d644` | PENDING |
| creator SEO page 4 | `drafts/creator_page_4.json` | publish | `{"destination":"public_site","path":"/creators/creator_delta"}` | `sha256:aee4edd3982ae2dabc3de829c43e95bc77c30cb887ee41fbb3b087d0d061ae50` | PENDING |
| creator scorecard 5 | `drafts/scorecard_5.json` | publish | `{"destination":"public_site","path":"/creators/creator_echo/scorecard"}` | `sha256:ce25c66fd4081f73e5b0c6606ee68385db2814c8ae581910fd4a45d1648c87a8` | PENDING |
| creator SEO page 5 | `drafts/creator_page_5.json` | publish | `{"destination":"public_site","path":"/creators/creator_echo"}` | `sha256:d5e3038dda1a95b64083fd3b172d274962fc497cbd8e2b72319031cdb347d638` | PENDING |
| weekly digest | `drafts/weekly_digest.json` | send | `{"audience":"digest_subscribers"}` | `sha256:afed94599f60f7784a0b61a6b40db0391db7a59e1ed45e083d7459182fabcecc` | PENDING |
| methodology page | `drafts/methodology_page.json` | publish | `{"destination":"public_site","path":"/methodology"}` | `sha256:16cc034d8a5212708fbc4e3ad24661479efa635c977a4ae292644c93473d5ddb` | PENDING |
| correction log page | `drafts/correction_log_page.json` | publish | `{"destination":"public_site","path":"/corrections"}` | `sha256:52f5209a8cef7a5cf0ab9f47e5dbf229c8538a70ae0b9dfc85e840d6bbba7cdb` | PENDING |
| GitHub methodology repo draft | `drafts/github_methodology_repo.json` | publish | `{"destination":"github","repo":"binarybaron/callscore-methodology","branch":"draft-controlled-launch"}` | `sha256:22f0bcb4bc7f41fff8cf307865a93bca30c21cf992cca9ea5ca15fbed5fa2ede` | PENDING |

## Required before launch

- Formal G0 scope lock acceptance.
- Manual verifier sign-off in `../G10_SIGNOFF_LEDGER.md`.
- Operator approval for each exact payload hash and target in `PAYLOAD_APPROVAL_LEDGER.md`.
- Hermes approval IDs for every required gate.
- Rollback plan and emergency stop acknowledgement.
- Fresh `workplane` test/validate/status/node --check verification.

No external action, publish, send, spend, production mutation, live third-party call, or money movement is approved by this manifest.
