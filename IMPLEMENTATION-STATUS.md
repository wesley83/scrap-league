# Scrap League implementation and release status

Updated October 16, 2026. This is a remediation candidate, not an accepted production release. The published game still uses the earlier deployment recorded in `audit/2026-10-16-publication.md`. Changes in this review have not been promoted to the public entry point.

## Scope and evidence

The user explicitly removed real-hardware, recruited human playtesting and perceptual listening sessions from required scope. Available browser automation, injected input, signal measurements, deterministic simulations and provider checks remain required. No physical-device or human verification is claimed. The original retrospective and failed runs are retained; newer evidence corrects earlier conclusions without replacing them.

`requirements.json` records 43 adopted outcomes and their verification stage. `audit/current-acceptance.json` records the current candidate's source/output identities and per-row status. A partial implementation or a passing component test is not a passed end-to-end outcome. Packaging requires all local rows; promotion also requires staged provider rows; claiming deployment verified requires live readback rows.

## Implemented in this candidate

| Area | Delivered behavior and evidence |
| --- | --- |
| Identity and sharing | Two branded OG posters; initial OG/Twitter metadata; ICO, raster, touch and maskable icons; bundled licensed fonts; independent decoded asset inventory. Result invitations preserve text, date/place and URL through native share, clipboard and manual fallbacks. The PNG scorecard QR was decoded with an independent implementation. |
| Storage and continuation | Split versioned stores, legacy migration/archive, bounded backup/import, category reset, draft compare-and-swap and two previous revisions, recoverable trash, atomic result/best/ghost/reward transactions, idempotent run IDs and content-aware saved-cup recovery. Save failure keeps the draft; Home awaits persistence; unload warnings follow unsaved work across screens. |
| Driving and progression | Chronological continuous rotating-capsule wall/car collision, bounded conservative fallback, seeded legal-input AI reaction/mistake profiles, all 81 build measurements and three continuous persisted twelve-event campaigns. Each campaign uses three laps per event and reopens storage between rounds. Latest retained campaign measurements show no player resets or sustained degradation. |
| Workshop | Multiple selection, group transforms, keyboard/list editing, partial-width surface patches, bounded recipe creation/edit/reassignment, technical template, canonical source preview, selection/view restoration and bounded undo history. All twelve official copies were edited, undone and serialized through the actual Workshop interface. Original authorship was CLI and remains a provenance gap against M03. |
| Input and presentation | Remapping, sensitivity, touch layouts, gamepad menus/ranges/pause/resume, explicit focus recovery, interruption pause and graphics-context rebuild. Cup/final scenes, reduced-motion paths, bounded audio voices and four measured audio motifs. Settings text was checked at twice the computed body font size. |
| Owner publication and routes | Pinned-host RAM-only owner credential, conditional track writes, safe catalog conflict/retry, direct invitations, discovery and cached-source fallback. Static native includes avoid server-JavaScript route dispatch. Provider primitive probes and local production-wrapper journeys exist; final native entry deployment/readback remains pending. |
| Casual boards | Strict client record parsing, captured daily identity, bounded cached lists, durable leased reconciliation and retry UI implemented and fixture-tested. The feature stays disabled until the actual server validation, retention and supported activation contract are verified. |
| Offline | Complete hash-verified install/status/repair, transactional staging, explicit token/deadline acknowledgments from every window, corruption refusal and natural multi-version browser updates. Retained modern packs now carry inventories and are checked before use. Cleanup preserves current/previous/open-client packs and does nothing when a window cannot identify its release. Legacy packs are retained conservatively. |
| Release control | Separate public/offline inventories, source/output hashes, refusal fixtures, staged provider gates, conditional data-preserving deployment and root rollback. CI has separate regression and exact-candidate jobs. Hosted enforcement and candidate results are recorded separately when available. |

## Remaining release gaps

These are required work, not accepted exceptions:

1. **Provider application contract:** public record validation, server-owned timestamps/expiry, physical five-day cleanup and a supported policy activation/readiness procedure remain unverified. A prior native-method probe intermittently returned HTTP 500 from a JavaScript memory-budget failure; the static include alternative passed primitive probes. The game must not expose unverified public writes.
2. **Exact browser journeys:** component checks and deterministic campaigns do not complete every adopted UI journey. The acceptance ledger identifies missing fresh-player, cup/reload, Time Trial/ghost and complete creator journey evidence. Earlier browser receipts retain their exact older release and scope.
3. **Cold browser relaunch:** a new document with the server unavailable and an isolated worker-runtime restart passed. The available browser tool cannot restart the browser process. A real cold process relaunch has not been established, so J13/M04 remain incomplete.
4. **Official authoring provenance:** current Workshop editability is verified; the twelve originals were generated using the shared CLI. The original UI-authoring milestone has not been retroactively satisfied.
5. **Final promotion:** exact candidate acceptance, required hosted checks, staged application evidence and final public asset/route readback must pass before promotion. Root rollback has isolated local tests; no production rollback is claimed.

Performance receipts preserve both failed and later optimized measurements. The first twenty-minute test exceeded its frame targets, and its wrapper incorrectly marked execution passed; the audit explicitly corrects that result. The sustained visible-canvas retest has a separate receipt and must be read on its own merits. No threshold was relaxed.

## Reproduction and ownership

Use the pinned Bun lockfile: `bun install --frozen-lockfile`, `node tools/build.mjs`, then `node --test tests/*.test.mjs`. The build reads authoritative `content/`; it never runs the destructive authoring utilities. `node tools/release-gate.mjs local` refuses missing or non-passing acceptance, even when all unit tests pass. `tools/review-server.mjs` hosts explicit local browser review controls and records their release, user agent, viewport and method.

`app/` contains the runtime, shared model/compiler and editor. `tools/` contains build, review, deployment and rollback tooling. `audit/2026-10-16-remediation.md` is the append-only work record. Provider fixtures use unique owned paths and are cleaned up conditionally. Credentials and private baselines remain outside Git. Existing hosted releases and player documents are preserved.
