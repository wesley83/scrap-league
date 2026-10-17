# Handbook follow-up audit

- ID: SL-HANDBOOK-20261017-B
- Planned UTC: 2026-10-17T21:04:59Z (clock observed immediately after recording this plan)
- Actor: Codex
- Request: Compare the deployed game against GAME-DEVELOPMENT-BEST-PRACTICES.md, address gaps, commit, push and deploy.
- Baseline: f6db045, published sl-60bf1fb46ea8c0. Handbook edition 2.8.0.

## Plan recorded before implementation

1. Inspect the handbook's source, state, input, feedback, community data, editor, accessibility, offline and release contracts against current code and retained evidence. Separate defects from unexecuted checks and unavailable environment capabilities.
2. Fix confirmed player-facing defects. Initial findings: score submission waits for a board GET before presenting name entry; aliases are not remembered; a submission validation error closes the form; explicit retry does not bypass a pending retry deadline; refreshed boards discard useful displayed results while loading. Verify related input, persistence and stale asynchronous-response behavior.
3. Execute the current game's meaningful journeys in the available browser, including campaign continuation, garage, solo score/ghost, editor create/edit/test/recovery, reduced motion, gamepad injection and responsive controls. Keep synthetic controller evidence distinct from real browser typing and pointer input.
4. Investigate observed public-board validation failures with bounded, owned fixtures. Preserve user records and negative evidence. Do not claim platform-wide guarantees from endpoint samples.
5. Run affected regressions and the complete automated suite, build the candidate, record hashes and reviewable diff, reconcile acceptance evidence without rewriting historical failures, commit and push. Deploy conditionally, retain old releases/player documents, and verify public assets, update behavior and changed UI.

Real hardware and human playtesting remain excluded by the user's instruction. Browser-process restart is unavailable in this tool; fresh-document offline behavior can be verified. Original official-circuit authorship cannot be changed retroactively. These limits will not be presented as passed checks.

## Findings and execution

Append findings, changes, evidence and limits here as work proceeds.

### Implemented corrections

1. Sections 7/9/10: Discoverable, remembered driver name in Leaderboards and Settings, explicit Add to leaderboard result action, and a form independent of optional online ranking reads. Validation is associated with the field; errors keep the form and entered text. Unicode code-point bounds match the public record contract, and names use text nodes and directional isolation.
2. Sections 5/9: Queue identity now rejects changed payloads. Reopening a submitted result shows its original name and status. Explicit retry clears local backoff but respects server Retry-After and active leases; rejected records are not silently retried. One pump never claims the same expired slow operation repeatedly. Visible clients retry eligible pending work periodically and on reconnect.
3. Section 9: A cache quota failure no longer hides a successful public board read. Refresh retains the currently displayed matching list until replacement is ready; a failed refresh is labeled stale/unavailable.
4. Sections 10/11: The 320px, actual 200%-computed-font fixture found 38px horizontal overflow. Dialog wrapping and responsive board controls now pass with zero horizontal overflow. This corrects the previous weak body-font-only fixture, which did not actually double fixed-size child controls.
5. Section 10: Manual touch Boost now includes throttle, making steer-plus-boost possible with two thumbs. Keyboard/gamepad mappings and simulation rules are unchanged. Resize clears held contacts; keyboard control focus loss releases its action.
6. Section 15: Add explicit foreground/reconnect update discovery, coalesce checks, throttle repeated foreground checks and expose a waiting-pack button on the yard. Updates still require explicit review/activation and existing multi-window safety checks. Recompute the visible UTC date on return. No closed-app push notification is claimed.
7. Section 13: Correct architecture documentation that still described the retired WebGL renderer's draw calls/particles. Current Canvas allocation/trail budgets describe the actual runtime.

### Handbook coverage map

| Handbook area | Audit result / action |
| --- | --- |
| 1–2 scope, experiments | Existing product requirements retained. This pass targets observed defects and complete journeys; it does not equate automated driving with enjoyment. |
| 3–4 sources/editor | Semantic content and DOM working source retained. New eight-piece circuit, gates/grid, compiler, failed-save navigation, source recovery, retry and five-AI test executed. Historical original-track authorship remains historical. |
| 5 state/persistence | Existing atomic result, migration, conflict and backup regressions rerun. Complete cup reload and twelve-event browser campaign adds missing current-renderer evidence. |
| 6 movement/AI | Shared fixed-step rules and legal controller paths retained. Focus/resize input cancellation corrected. Every track completes in regression campaigns; no new fairness claim. |
| 7–8 feedback/progression | Action-based practice, garage tradeoffs, improved solo best/ghost, four cup scenes and held ending verified. No spend-based economy exists. |
| 9 community/calendar | Name/queue/retry/cache defects corrected. Exact public Trial and Daily probes passed at 21:11 UTC, including duplicates, split arithmetic, unsupported builds and client expiry. All four owned accepted rows were conditionally removed. Earlier intermittent failures remain retained. |
| 10–11 input/access | Keyboard, injected gamepad/touch, six layouts, actual enlarged name dialog and normal-browser typing are separate checks. No physical-phone or full WCAG-conformance claim. |
| 12 scenes/audio | Current muted/reduced-motion complete campaign and held ending. Existing bounded signal/voice regressions retained. No perceptual listening requirement. |
| 13 performance | Buffer/trail bounds and context recovery checked; twenty-minute current-app-loop measurement follows after other CPU-heavy checks finish. |
| 14 artwork/sharing | Required icon/OG inventory, decoded dimensions, initial metadata, licenses and sharing fallback regressions pass. No assets removed. |
| 15 offline/updates | Foreground/reconnect discovery and visible update control added. Exact real-worker update/offline observations recorded separately; cold browser-process restart remains unavailable. |
| 16 security/privacy | Existing pinned owner destination, hostile imports, public validators and secret scans retained. Nickname is a local preference until explicit submission, never an authenticated identity. Casual times are forgeable. No live moderation or provider-wide enforcement guarantee is advertised. |
| 17 release/recovery | Source/output gate, conditional promotion, preserved releases/data, asset/route readback and append-only receipts remain mandatory. |
| 18 genre modules | Arcade/action and asynchronous community checks apply: continuous collision, legal-input campaigns, idempotent rewards, captured daily identity and leased outbox. Unimplemented genres and real-time multiplayer are outside the product contract. |
| 19 Pagelove adapter | Independent HTML sources, DOM editor, derived simulation, pinned owner writes, application-board validation and conditional deployment are retained. Existing policies are preserved. Isolated Workshop publication/ETag/lost-response checks and populated-data survival add current provider evidence. |
| 20–23 example/templates/glossary/license | The worked model is illustrative, not an instruction to replace this game's schema. Existing requirements, audit receipts and MIT/source notices supply the corresponding project records. |

### Verification corrections retained

`handbook-browser-first-pass.json` and `handbook-browser-before-reflow-fix.json` retain the initial form-lookup fixture race and actual reflow defect. The file chooser is asynchronous; the fixture now waits for it. `handbook-browser-before-fixture-isolation.json` retains a fixture attempting background controls while its preceding modal remained open. The wrapper now dismisses it through the normal close path. A later practice check observed a result before the already-running persistence promise finished; the fixture now waits for saved/error status. Isolated follow-ups passed. These fixture failures are not reclassified as successful results.

Full automated suite: 107 passed, zero failed, 56.3 seconds (`handbook-unit-tests.txt`). Final browser and performance receipts identify their exact runtime. This entry will be supplemented with publication and any remaining limits.

### Populated-data publication check

At 21:31 UTC, add a bounded owned synthetic Trial row before publication, retain hashes (not payloads) of existing rows, and compare after promotion. The helper conditionally removes only its own row using a fresh ETag. This closes the earlier empty-board preservation-evidence gap without replacing player data. Credential input stays hidden and in memory. tools/check-release-data.mjs records the owned identifier before the first write to permit ambiguous-write cleanup.

Timestamp correction: that planning entry used an estimated time. The actual first request is recorded at 21:29:35Z and returned 500; the same identifier was later accepted with 206 at 21:30:58Z. Both remain in the receipt. A successful earlier policy probe does not prove intermittent provider errors are resolved.

The separate Workshop check uses the production publication functions with one owned duplicated circuit. It injects a stale catalog ETag and drops an actually accepted owner response, checks public semantic readback and listing retry, and retains the populated definition/catalog entry across promotion before conditional cleanup. Only hashes of unrelated catalog entries are recorded. These endpoint fixtures do not substitute for a complete browser owner-key form journey.

The current Workshop checks passed catalog-conflict/direct-link continuity, listing retry, stale-baseline refusal, wrong-credential refusal and lost-response semantic reconciliation. A separate live outbox fixture uses two independent IndexedDB connections (fake-indexeddb), the real production Store/Boards code and actual public endpoint. One accepted response was deliberately dropped; one claim, one original ID and one public row reconciled to confirmed. The owned row was conditionally removed. Browser storage is verified separately; this is not claimed as two physical browser windows.

Performance scope correction discovered during the uninterrupted run: the prior context-recovery fixture reconstructed a lower-resolution renderer. Resetting the settings object did not reconstruct that instance. The long run therefore establishes endurance at the retained 1x canvas allocations. Browser devicePixelRatio was observed as 1.5. A separate complete six-car race explicitly reconstructs the default-resolution renderer, captures CSS/buffer sizes, and checks the same p95/p99 thresholds. The original long-run raw samples remain unchanged; no threshold is relaxed.

The lower-resolution endurance run completed 1,200,030.9 ms, 71,846 frames and 40 track loads with zero hidden time. p95/p99 scheduling intervals were 17.1/17.4 ms; longest frame 83.5 ms, three frames over 50 ms, and maximum 360 trails. These are real application-loop observations, not only draw-call timings. Raw intervals, scene-load durations, canvas sizes and available JS heap estimates are retained in `handbook-performance.json`.

Default-resolution performance failed twice (receipts retained): first p95/p99 33.3/100.2 ms; an isolated repeat improved to 16.9/33.4 ms but still missed the unchanged p99 <=33 ms target. Inspection found hundreds of separate curb/trail strokes per frame plus static curb geometry recomputed every frame. Plan: precompile the two curb-color paths when loading the track and batch equal-style trail segments into one stroke. This changes derived presentation work only, retains the resolution/effect budgets and requires a fresh default-resolution race, all-track/recovery visual checks and final full tests. Earlier unchanged-input/storage evidence will be reused only with this sole renderer difference explicitly recorded.

After batching, sl-6f79bfd18ca0be completed a default-resolution, full-effects six-car two-lap race in 50.1 seconds wall time. All 2,999 observed frames stayed at or below 17 ms; p95/p99 were 16.8/16.9 ms, zero hidden time. Buffer size was 1920×753 during racing (the CSS canvas had already expanded for the result when the final summary read its dimensions). The unchanged thresholds passed. The exact new release also completed all twelve three-lap campaign events with between-round reload, muted/reduced-motion/low-effects settings, four scenes and the held ending. Neither test forces finish flags.

Final current-runtime browser recheck: all 14 checks passed, including the previously failing garage fixture, the eight-piece creator journey and failed-save recovery, real enlarged text, touch ownership, manual throttle layouts, all twelve track views/context repair, and foreground update controls. The complete suite was rerun after the renderer/tooling changes: 107 passed, zero failed, 56,244.0 ms. The first 107-test run remains separately retained.

The normal installed local copy then updated from sl-b2a6a7eab4f634 to sl-6f79bfd18ca0be using the visible home update notice and explicit Apply. Progress (5/12 parts, 1/12 events) and Browser Driver remained. After stopping its server and independently confirming connection failure, a fresh document reached 66 km/h using actual keyboard input. Workshop reopened its prior draft, saved the new name Offline final circuit, and reopened that name after another offline reload. Actual browser-process restart remains untested.
