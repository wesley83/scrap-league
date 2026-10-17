# SL-REMAKE-01 — arcade remake

- UTC: 2026-10-17; actor: Codex.
- Request: remake the unsatisfactory game using the Web Game Development Handbook, edition 2.8.0. A complete racing game and bundled editor remain the delivery contract.
- Baseline: commit 71a6b1d. Retain original implementation and evidence in Git. User screenshot shows a white WebGL surface with a running race HUD. Local baseline renders, but its overview is distant, muted, and the main action leads through campaign setup. Source inspection finds time-based keyboard-only lesson prompts and touch state without per-contact ownership.

## Plan recorded before implementation

1. Replace the GPU-dependent race presentation with a purpose-built overhead Canvas 2D renderer. Keep the tested fixed-step simulation, source HTML, compiler, collision dimensions, editor, saves, campaign, ghosts, public boards and release-pinned PWA. Render caches are derived, never editable authority.
2. Rebuild the opening and racing interfaces around one immediate two-lap Quick Race. Keep League, Trial, Daily, Garage and Workshop reachable. Make public leaderboards reachable before finishing a race. Keep result submission deliberate.
3. Frame the road ahead and player inside an unobstructed play rectangle in portrait and landscape. Use a recognizable numbered car, checkered finish, directional markings, visible boost and skid feedback. Reserve space for the HUD and touch controls instead of covering the driving line.
4. Give touch controls independent pointer ownership, visible held states and cancellation. Keep keyboard/gamepad and remapping. Teach actual acceleration, steering, braking and boosting in an optional one-lap practice; practice cannot grant campaign rewards or submit scores.
5. Simplify editor entry and preserve DOM authoring, undo/redo, validation, recovery, export/import and test-drive return. Do not replace stored drafts or production user records.
6. Run bounded simulation regressions plus actual local browser journeys, portrait/landscape geometry, rendering failure/recovery, editor round-trip, results/retry and offline/update fixtures. Inspect screenshots and record LLM judgement separately from measured results. Refresh documentation and exact-candidate evidence. Do not use historical pass counts as acceptance of the remake.

## Experiment / decision

- Question: does the new overhead presentation expose the road, player and next action clearly without WebGL dependence?
- Whole-design comparison: old Three.js view versus Canvas 2D; same HTML tracks, fixed-step physics, starter build and seed. No causal claim about a single visual change.
- Expected invariants: identical world coordinates/collision body; draw calls do not mutate race state; pause stops race time; viewport changes only affect presentation; all source tracks remain compilable; every public result retains mode/content/build/assistance identity.
- LLM rubric: clear primary action, visible player/front direction, readable road edges/next bend, feedback corresponding to actual events, useful touch targets without play obstruction, editor first-use clarity.
- Bounds: at most two major renderer/layout revisions before resolving concrete observed faults; deterministic simulations capped at existing 720-second race limit; browser checks in the available Chromium engine only. Physical-device/human-testing requirements remain removed as requested.
- Keep rule: new renderer passes geometry, state isolation and browser journeys, and captured states improve the rubric. Retain known failures and revise before claiming completion.

## Required remake evidence

R1: visible cold-start and race without WebGL; R2: Quick Race start/pause/resume/finish/retry; R3: input ownership/cancel; R4: practice actions and isolated rewards; R5: desktop/portrait/short-landscape layouts; R6: editor edit/undo/save/reload/test/return/export validation; R7: progress and settings compatibility; R8: reachable shared board and accurate network states; R9: complete assets/offline/update regressions; R10: build, exact source/output receipts, and honest release status.

The existing detailed acceptance ledger remains historical until corresponding current evidence is reconciled. No unexecuted requirement becomes passed merely by this plan.

## SL-REMAKE-02 — browser findings and corrections

2026-10-17, Codex. Final-browser checks caught an existing production bug: Boards called the native fetch as a method of its instance, causing Chromium's Illegal invocation error. Correct the receiver and add a receiver-sensitive regression. The ghost fixture also assumed a new attempt must replace an already faster stored best; correct its oracle to preserve the minimum. These failures are retained in the pre-final browser receipt. Add manual-throttle layout checks and refresh the current design/asset documentation for the Canvas renderer and DOM source. Live public probe 20:17 UTC accepted/read back both modes and removed all owned synthetic rows; duplicate and split-arithmetic probes returned server memory-budget errors. Do not report that policy probe as passing.

## SL-REMAKE-03 — verification and publication preparation

2026-10-17, Codex. Full suite: 101/101 pass in 80.9 seconds. The subsequent manual-touch prompt correction changes only W to GAS when touch is enabled and manual throttle is selected; focused practice/renderer/source tests pass. Local browser races, retry, editor round-trip, practice/ghost, twelve renders, recovery and six layouts pass. The final ghost fixture preserves an existing faster best. Canvas draw cost in the 180-frame desktop sample: median 0.9 ms, p95 1.1 ms, maximum 1.4 ms; this is not end-to-end mobile FPS or a long soak.

The normal installed local game updated from sl-de66ac8ab06a61 to sl-100882d0435165 through Settings, Check offline pack, Apply update. Initial download completes asynchronously and a second Check exposes Apply update; that pre-existing usability limitation remains. Stopping the owned server on port 4397 produced a confirmed refused network connection. A fresh browser document still loaded, showed Offline pack verified, moved under actual W input (41 km/h), and saved/reopened the named Offline remake circuit. Browser-process restart is unavailable, so it is not claimed.

Leaderboard browser diagnosis: the fixed client makes a request; the public endpoint returns 206 but no Access-Control-Allow-Origin for localhost, while the exact public origin receives its own allow-origin. Local UI correctly reports unavailable. Keep that failed local network fixture and verify the same-origin UI after publication. Do not weaken provider CORS to make a localhost test pass.

Visual review (LLM, not human enjoyment): the home has one dominant race action, the numbered yellow player and YOU marker are visible, road edges and next direction are distinct, and touch controls sit below the racing surface. The Workshop keeps editable numeric fields and validation beside the track. Renderer changes are a whole-design replacement; no isolated causal claim or hardware benchmark is made.

Prepare a reviewable commit and data-preserving deployment under the user's standing commit/push/deploy instructions. Preserve the previous authorization and acceptance receipts before binding new receipts. Retain incomplete product rows and the exact live-provider faults; do not report full release acceptance. No player documents, prior immutable releases, or non-test public scores are replaced.
