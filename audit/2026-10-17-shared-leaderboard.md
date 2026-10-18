# Shared leaderboard implementation

Plan time: 2026-10-17T02:01:32Z. Actor: Codex. Request: correct the prior claim that Pagelove capability explains the missing Scrap League leaderboard; the user points to Prism Breaker and states Pagelove hosts share the same capabilities.

## Finding

The earlier explanation confused capability with provisioning. Prism Breaker has an active casual leaderboard using per-site native Pagelove score resources and public authorization/validation/retention rules. Scrap League already contains a complete client-side shared-time dialog, durable outbox, parser, ranking and retry logic, but `HOST_CONFIG.publicBoards` is null and neither `/boards/trial.html` nor `/boards/daily.html` is included in the deployed host. The endpoints are game-specific and must be separately authored on Scrap League's host; Prism's existing resource does not automatically populate them.

The user explicitly corrected the host-capability framing: “All hosts have the same capabilities. There is no meaningful reason not to have a leaderboard.” This work proceeds with Scrap League-specific casual boards on its existing Pagelove host. The host-level provisioning requirement is treated as work to complete, not a reason to leave the feature disabled. The user's earlier confirmation that Pagelove has no separate supported global policy-activation/readiness procedure remains a limitation on a provider-wide guarantee, not a blocker to testing and enabling the isolated application resources.

Pagelove's documented and observed policy propagation can be inconsistent during edits, and the user previously confirmed no provider-supported readiness procedure is available. This remains a verification limitation, not a difference in host capability. Any public board must use separate, narrow board documents, server-side shape/schema/trigger checks, server-generated receipt/expiry fields, bounded retention and real endpoint probes. It must be explicitly described as casual and client-reported. Preserve local records if server submission fails.

## Plan

1. Reuse the existing Scrap League board client and create two host-specific native Pagelove board resources with isolated `#runs` collections, strict field/schema/shape checks, uniqueness, server receipt/expiry defaults, and expiry-only cleanup on online access.
2. Add a conditional owner-publication path that only creates missing board resources and refuses to replace records. Do not alter the already deployed game's other documents or release folders.
3. Enable the client only with a source-controlled, host-pinned policy revision. Update wording and the implementation/acceptance evidence to distinguish same platform capabilities from per-host policy deployment.
4. Run generator/policy tests, build, the complete automated suite, release-gate checks, provider positive/negative write/readback probes and exact public deployment readback. Record any limitation precisely; do not claim global policy readiness beyond the evidence.

## Evidence boundary

No hardware, human playtesting or listening sessions are required. Public board writes are anonymous, casual and forgeable by design; no competitive integrity or anti-cheat guarantee is claimed. A positive/negative endpoint test and readback are required before describing the board as operational. Five-day cleanup is access-driven, not a scheduled background job.

## Live probe findings and correction

UTC 2026-10-17 02:25. The public Trial board was already present, had the expected policy fingerprints and zero records; the Daily board path was missing and was created with create-only DAV semantics. The first public read probe exposed Pagelove's paginator contract: an identified paginator emits `paginate:runs:page` links, and an empty collection advertises last page 0. The client and verifier were corrected to follow the ID-prefixed links while retaining origin/path/query validation and the 1,000-row bound.

The first anonymous valid-write probes returned 422 before reaching run validation. Pagelove's ShapeConstraint response identified `xmlns:p` on the constrained `<ul id="runs">` as an unpermitted attribute. The source now declares the paginator namespace on `<html>` and leaves only `p:paginate` on the list. The owner publisher migrates only the known prior layout using `If-Match`, saves an ignored local pre-migration copy, preserves all rows, and refuses any unknown policy. Re-run the live probe after this migration before enabling the client publicly.

## Final implementation and endpoint observations

The release candidate enables the game UI for the two canonical board paths, stores Trial and Daily runs in separate native resources, and serves shared times on the public `hire-poker-8313` origin. Both source documents were conditionally migrated/provisioned with zero existing rows, and owner/public inspection confirmed the exact expected policy fingerprints. The public paginator strips its authoring-only attributes but returns valid page links; the client follows them with a bounded ten-page read and retries only safe GETs for selected transient responses.

The local suite passes 94/94, including native policy validation, pagination, retry/readback reconciliation, offline queue behavior, and retention fixtures. The full output is retained in `audit/leaderboard-local-tests.txt`.

Anonymous probes at 2026-10-17 15:21 UTC accepted and read back one Trial and one Daily run. Both records had matching identities, server receipts, and the expected five-day expiry. Split arithmetic, client-supplied expiry, and unsupported builds were rejected with 422. The Trial duplicate was rejected by the provider's uniqueness constraint with 422 and did not append a second row. The Daily duplicate returned a generic 403 in that run but did not append a second row. All accepted synthetic rows were conditionally removed with owner ETags.

A follow-up at 15:24 UTC accepted two distinct Daily scores, rejected the duplicate with a uniqueness 422, rejected all three invalid payloads with 422, and conditionally removed both synthetic rows. That same run returned a generic 403 for a fresh Trial score before storing any row. A prior Trial positive write had succeeded; this inconsistent later response is not explained by the matching source/policy fingerprints. Per the Pagelove field guide, a 403 is not treated as a routine transient response or retried blindly. The client retains the local result and reconciles any already-accepted run by ID.

Consequently, the feature is implemented and the two board resources are live, but public write readiness is only partially verified: Daily accepts multiple independent submissions, and Trial has both a successful observed write/readback and a later 403. Do not represent this as a provider-wide guarantee. The user confirmed no separate supported global policy-readiness procedure exists. The game candidate was subsequently promoted after all immutable assets passed Pagelove readback; `audit/deployment.json` records the release. See the timestamped provisioning and public-check receipts for the exact observations and cleanup.
