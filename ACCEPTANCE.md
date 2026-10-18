# Scrap League acceptance and implementation plan

## Responsive-layout supplement — October 18, 2026

R01 adds four required local scenarios for the reported phone defect: home/action geometry at 320–1440 CSS pixels including the breakpoint boundary, enlarged text, complete portrait/landscape menu/play journeys, and changing viewport heights/injected safe regions. The inventory now contains 48 requirements and 106 named scenarios. Its `layoutGuidanceSupplement` pins edition 2.11.0 Sections 10/11 and records the bounded impact review; the original 47/102 contract and 2.10 governing snapshot remain historical baseline obligations. No native/physical requirement is reinstated and no existing required outcome is waived. Current evidence and limitations are in the responsive-layout audit.

## Delivery boundary

### Handbook 2.10 audit adoption

The October 17, 2026 audit adopts handbook **2.10.0**, SHA-256 `b805bc8e89e61d567fac2d26d5e8bcc33e75e57964924a0b7aa6a3be7105c0f4`, retained at [the pinned snapshot](audit/2026-10-17-guide-2-10-audit/governing-guide.md). `requirements.json` is the authoritative inventory; its `governingGuide` records map revision **handbook-2.10-r2**, with the original baseline of 47 requirements and 102 individually required scenarios; the responsive-layout supplement above extends the current inventory to 48/106. The [follow-up scope record](audit/2026-10-18-remaining-requirements/scope-corrections.md) retains the user's explicit native-desktop exclusion and corrects P08 to capability recording/established-policy preservation while retaining actual endpoint validation. Real hardware and human playtesting remain excluded. The earlier numbered best-practice table below describes historical design-time mapping, not the current guide's section numbers. Old reference snapshots remain historical. Future guide changes require an explicit impact review.

| Current guide section | Applicable contract and inventory IDs |
| --- | --- |
| 1 Scope/evidence | Existing physical/human exclusions; pinned guide, exact inventory and separate reviews; C09–C11 |
| 2 Player/delivery contract | Quick Race, League, Trial, Daily, practice and Workshop; J01–J10, M01–M04 |
| 3 Architecture/authority | Authored HTML, one editor DOM source, shared compiler, derived renderer and composed shell; M01, P04/P07/P09, C12 |
| 4 Editor/recovery | Validate/import/export, history, asynchronous save/navigation and first-entry reads; J08–J12, P01, M02 |
| 5 State/checkpoints | Captured cup/run state, atomic restore/results and input/clock ownership; J02–J04/J16, P01/P02, M04 |
| 6 Simulation/input/AI | Fixed step, legal AI controls, swept contacts, camera and cancellation; M01/M03, J02/J16 |
| 7 Feedback/progression | Practice, visible cues, garage tradeoffs and bounded progression; J01/J04/J05/J18 |
| 8 Scoring/effects/economy | Split arithmetic, cup rewards, boost/surface/reset interactions; J03–J07, P02, M01/M03 |
| 9 Shared results/calendar | Casual trust, original Daily identity, durable queue, leases and retention; J07/J15, P03/P05/P06/P08 |
| 10 Layout/controls | Available Chromium dimensions, keyboard/gamepad/touch contracts and complete journeys; J02/J08/J16, C09 |
| 11 Accessibility | Native UI, focus, measured contrast/reflow, enlarged text and motion; J02/J17/J18, C09. No full WCAG conformance claim. |
| 12 Scenes/audio | Four held scene families, mute/reduced motion and bounded signal checks; J18, M04 |
| 13 Performance | Actual renderer/buffer/quality, cold/long-run receipts and unchanged-dependency reuse; J16, M01/M04, C09 |
| 14 Assets/sharing | Independent branded asset contract, decoded images/icons, licenses and sharing fallbacks; C01–C03/C06, J17 |
| 15 Offline/updates | Complete verified pack, safe updates, old clients and offline journeys; J13/J14, M04, P09 |
| 16 Security/data | Inert bounded imports, trusted owner DAV, public shape/retention and private package exclusions; J10, P04–P06, C07 |
| 17 Release/maintenance | Strict gate on every publisher, pinned reviews, preservation, phase journal and operator recovery; C04/C05/C08/C10/C11/C13/C14, P09/M06 |
| 18 Genre | Arcade racing and asynchronous community competition apply. Platforming, puzzles, cards, dialogue branching, rhythm and real-time multiplayer modules are not adopted because those mechanics are absent. |
| 19 Pagelove adapter | HTML definitions, native composition, owner conditionals and separate public-rule probes; P04–P09/J11/J12/J15 |
| 20 Included model example | Illustrative reference, not game acceptance; actual model/storage scenarios use M01/P01/P02 |
| 21 Evidence templates | Qualified fixtures, selected interleavings, review/reuse and retrospective closure; C09–C14/J08/J09 |
| 22 Glossary | Terminology reference; no separate runtime feature |
| 23 Handbook maintenance | Guidance provenance for C11; handbook publication is not a game runtime obligation |

The available matrix is Windows/in-app Chromium with emulated layouts and injected device adapters, plus actual connector keyboard/pointer actions when explicitly recorded. It does not certify Edge on a physical phone or an unavailable engine. English UI is the adopted language; Unicode player aliases are supported. Synthetic inputs do not prove browser gesture arbitration or human enjoyment. Optional recorder/pathfinding/real-money/identity-account systems absent from this game are not new requirements.

New controls C11–C14 are required where applicable, with results in the same inventory/ledger as the existing IDs. The audit reopens unsupported broad pass claims instead of removing their promised subcases. An operation receipt cannot waive any required outcome. Review completion means all rows were evaluated, including unresolved rows; it does not mean the product is accepted. Required unresolved rows still block the corresponding release. A new required-outcome defect reopens its row and invalidates the affected decision before entry promotion.

The design package defines a complete first release, including the Track Workshop. Implementation is complete only when the player journeys below have evidence on the exact release revision. The visual study demonstrates layout and selected interface responses; it does not prove physics, track validity, persistence, publishing or browser behavior.

Use status values Passed, Failed, Not run, Blocked and Accepted exception, always with revision, environment and evidence. All runtime acceptance rows begin **Not run**. A design review or test count does not convert those rows to Passed.

## Implementation sequence

| Milestone | Concrete deliverable | Exit criteria |
| --- | --- | --- |
| 1 · Model and handling laboratory | Shared schemas, parser/serializer/compiler, independent geometric fixtures, one car and a loop | Clean source regeneration; round-trip integrity; swept collisions, skidpad/slalom/braking checks; input/pause/recovery state contracts |
| 2 · Integrated race and Workshop | Six-car race, modular road editor, surface/prop/gate tools, real test drive, history and drafts | A new track can be built, validated, driven, recovered and exported/imported through the UI; one complete keyboard/touch-emulated journey |
| 3 · Garage and full content | All 81 builds, twelve circuits, four cups, eight rivals, unlocks and results | Official tracks authored in Workshop; all references resolve; all tracks finish under seeded AI; seeded handling/pacing measurements complete |
| 4 · Resilient player experience | Saves, ghosts, daily definitions, offline pack, install/fullscreen, audio and sharing | Transaction/failure tests; genuine offline relaunch; natural update journey; phone layouts and keyboard focus |
| 5 · Pagelove integration | Native composition, owner publication, discovery index, casual boards | Correct-host readback, ETag conflict and ambiguous-write recovery; exact-host positive/negative record checks. Boards remain explicitly casual; missing provider-wide readiness remains visible and is never called globally verified. |
| 6 · Release candidate | Complete asset pack, required CI, audit evidence, release/rollback tools and browser verification | All required rows pass or have explicitly accepted scoped exceptions; exact package verified and previous-client update succeeds |

Milestone 2 is the first playable slice. It includes the editor from the beginning. Milestones are dependency gates rather than unsupported calendar estimates. Casual boards may be enabled after host-specific server-rule and retention checks; a provider-wide policy-readiness guarantee is tracked separately and remains a disclosed limitation.

## Required player journeys

| ID | Journey and expected outcome | Evidence method |
| --- | --- | --- |
| J01 | Fresh player loads, learns the controls, starts and finishes Yard Loop without an account | Browser journey with retained evidence |
| J02 | Player pauses, opens settings, returns, resumes and immediately steers without a focus/input surprise | Keyboard-only and injected gamepad/touch browser checks |
| J03 | Player completes a three-race cup, reloads between rounds, and keeps exactly one set of rewards | Storage transaction assertions and UI journey |
| J04 | Player completes all twelve events with ordinary inputs/resources and sees the held final scene | Continuous persisted seeded campaigns; no forced finish fixture as a substitute |
| J05 | Player compares and equips a part, tests it and can explain its tradeoff | Bench measurements and matching garage descriptions |
| J06 | Player finishes a Time Trial, sees correct lap arithmetic, races a compatible ghost and improves a best | Independent timing fixtures and UI journey |
| J07 | Player starts before UTC midnight, finishes after it, uploads later and remains on the original challenge | Injected calendar/network boundaries and recorded challenge identity |
| J08 | New creator builds a closed circuit, corrects a gap, places gates and drives a valid lap | Pointer, keyboard/list and emulated touch workflows |
| J09 | Creator tests against five AI, returns to exact editor context, undoes, reloads and recovers work | UI plus stored-revision assertions |
| J10 | Creator exports, imports and gets identical gameplay meaning without executing hostile content | Canonical round trip and adversarial inert-import fixtures |
| J11 | Two owner editors conflict; stale editor preserves work and never overwrites the newer track | Disposable real provider document with conditional writes |
| J12 | Published track succeeds but catalog update conflicts; exact link works and listing retry is safe | Provider fault fixture and readback |
| J13 | Player downloads complete content, stops the server, cold-relaunches and races/edits offline | Actual browser/worker restart with the server unavailable |
| J14 | Existing release discovers a new version naturally and updates between runs without losing state | Two-version browser lab |
| J15 | Score submission times out after server acceptance; original ID reconciles once across two tabs | Durable outbox and disposable provider evidence |
| J16 | Graphics context is lost, phone rotates or input disconnects; invisible simulation stops and explicit resume works | Browser context, viewport and input fault injection |
| J17 | Result/track invitation contains useful text and link; canceled share preserves state | Complete payload checks and success/cancel/failure browser fixtures |
| J18 | Reduced-motion, muted and low-effects players can finish and read every transition/result | All scene families, audio signal analysis and browser readability checks |

## Model, geometry and simulation oracles

Tests must derive expectations from the contract rather than repeat the production algorithm.

- **Round-trip oracle:** Generate bounded valid documents; parse, serialize, parse and compare semantic identities, references and every supported field. Unsupported properties fail explicitly. Remove previous generated bundles and prove a clean build succeeds only from authoritative sources.
- **Topology oracle:** Independently traverse the successor graph; prove one cycle covers all pieces. Use analytic endpoint/tangent calculations for bends and transitions. Include disconnected cycles, duplicate IDs, missing references, reversed pieces and wrong widths.
- **Geometry oracle:** Compare rendered/compiled boundary descriptors to analytic distances for straight, circular and taper fixtures. Include true misses, tangencies, initial overlaps, inner/outer corners, high-speed multi-contact paths and a wall collision followed by car contact in the remaining step.
- **Checkpoint oracle:** Feed known continuous paths through finite gates. Include backwards crossing, repeated crossing, skipped gates, nearby parallel road, a complete valid lap, finish during reset and two crossings within one simulation tick. Verify a reset never increases progress.
- **Timing oracle:** Sum known fixed steps and an independently calculated crossing fraction. Pause contributes zero; reset contributes its actual elapsed delay; displayed/serialized rounding occurs once. Verify lap splits sum exactly to recorded integer total, assigning any rounding remainder to the final split.
- **Physics fixtures:** Measure straight acceleration, governed speed, braking, constant-radius skidpad, slalom, surface transitions, handbrake recovery and collision response for all 81 builds. Compare each changed part with its stated tradeoff; investigate domination or contradictory garage text.
- **Effect matrix:** Boost plus pad, empty charge on a checkpoint, finish plus charge award, mud plus handbrake recovery, reset while boost held, pause during effect and duplicate trigger delivery. Maximum strength and duration remain bounded.
- **AI oracle:** AI emits only legal controls; both player and AI pass through the same simulation. Seeded six-car runs cover every circuit and each difficulty, including obstruction/recovery. Inspect passing behavior and avoid assuming faster clean-line completion means enjoyable racing.
- **Progression oracle:** Independently compute cup points/tiebreaks and milestone rewards. Duplicate result processing, replay and interrupted transaction never duplicate an unlock. Restarting a cup leaves collected parts and historical medals intact.

## Persistence and provider acceptance

| ID | Boundary | Required failures and controls |
| --- | --- | --- |
| P01 | Draft storage | Transaction abort, quota denial, tab conflict, incompatible schema, crash before/after commit; last valid draft survives |
| P02 | Result transaction | Abort between result and rewards; retry same run ID; best/ghost remain a consistent pair |
| P03 | Outbox | Two tabs, expired lease, late response, closed DB connection, duplicate acceptance, permanent rejection, full queue |
| P04 | Owner authoring | Correct pinned host, wrong credential, stale ETag, create-only conflict, ambiguous response and semantic readback |
| P05 | Public records | Missing/extra fields, wrong types, unsupported content key, invalid splits, client expiry, duplicates and prohibited mutations all rejected through the actual application endpoint |
| P06 | Retention | Before/at/after five-day expiry, multiple expired rows interleaved with active controls, offline filtering, repeat cleanup and separate physical inspection |
| P07 | Native composition | Valid/missing/unknown slug, hostile path input, intended source fragment and fallback after composition failure |
| P08 | Policy activation | Record whether a supported provider procedure/readiness contract exists; source ETag/OPTIONS/warmup never count as global enforcement readiness |
| P09 | Data-preserving release | Populated Workshop, catalog, boards and old-client assets survive; no duplicate live schema declarations in immutable bundles |

Use synthetic aliases and disposable resources. Keep sanitized request/status/body evidence, correlation identifiers when present, UTC timestamps and positive/negative controls. Delete only fixtures owned by the experiment and verify cleanup. Repeated intermittent failures remain in the record even if retry succeeds.

## Available-browser verification matrix

| Surface | Required checks | Initial status |
| --- | --- | --- |
| Desktop Chromium at 1440×900 and 1024×768 | Complete keyboard journey, injected gamepad, resize, multi-tab storage/update, focus and context recovery | Not run |
| Additional desktop browsers when available | Game, Workshop, audio, storage and fallbacks | Optional compatibility evidence |
| 320 px portrait and short 667×320 landscape emulation | No clipped controls/dialog actions, long names, validation list, HUD/road separation | Not run; emulation does not certify devices |
| 200% text/zoom, keyboard and accessibility-tree inspection | Menu/garage/editor/result semantics, focus order, labels, validation and dynamic announcements | Not run |

Record the available OS/browser version, viewport, input method, tab/installed/fullscreen state and tested release. No hardware inventory or physical-device session is required. The previous game's Android upper-strip observation remains historical evidence; do not claim this game's geometry is fixed without measuring it. UI preference forbids decorative northeast arrows and colored accent side rails. Verify that no later visual polish reintroduces them.

## Automated balance and audio review

Physical-device sessions, player recruitment, human playtesting, perceptual listening sessions and physical assistive-technology checks are outside required release scope by the user's October 16, 2026 instruction. Their absence does not block publication. Existing evidence is not relabeled as physical or human verification.

Compare seeded controller profiles across the first race, mixed surfaces, final cup and complete persisted campaigns. Record completion, retries, active time, resource use and recovery anomalies. Verify garage descriptions against all-build measurements and inspect onboarding/recovery controls in the browser.

Analyze engine/surface combinations, all four music motifs, collision/boost overlap, pause/resume and victory transitions for nonfinite samples, clipping and bounded voices. Check mute and visible equivalents for essential cues. These checks establish signal and behavior bounds, not subjective enjoyment or loudness.

## Performance and update acceptance

Measure the budgets in ARCHITECTURE.md in the recorded available browser environment. Include cold first collision, first pad, every car part, max-track editor validation, repeated race/editor switching and 20 minutes of play. Record p95/p99 frame time, long tasks, memory trend, effect counts, download bytes and load timings. Lower quality can reduce presentation cost but never change route, AI, physics, timer or scoring.

The update laboratory must cover complete A and B packages, interrupted B download, corrupt/missing asset despite a readiness marker, quota failure, stale status response, duplicate activation clicks, tab state changing during activation, worker restart, two clients on different releases and server disappearance. Verify preserved progress/drafts/outbox and that a timed-out operation cannot later reload without an active request.

## Best-practice coverage

The following maps every substantive handbook section to a concrete design owner. It is traceability, not runtime certification.

| Handbook topic | Design decision and evidence requirement |
| --- | --- |
| 1 Player contract | GAME-DESIGN modes, first ten minutes, win/exit rules; J01–J07 |
| 2 Document model | ARCHITECTURE resources/schemas/revisions; round-trip and topology oracles |
| 3 Pagelove suitability | Explicit native uses, trusted DAV and public record boundaries; P04–P09 |
| 4 Extensibility/editor | TRACK-WORKSHOP and behavior registry; J08–J12 |
| 5 State/input/simulation | Fixed-step model, transitions, interruption and collision rules; J02/J16 and independent geometry |
| 6 Engagement | Car tradeoffs, contextual lessons, quick retry, named rivals and completion; seeded and browser review |
| 7 Balance | Twelve-track teaching/pacing map, all-build bench fixtures and controller-profile comparison |
| 8 Scoring/fairness | Exact race time, cup arithmetic, tiebreaks and comparison keys |
| 9 Effect interactions | Explicit boost/pad/surface/reset precedence and interaction matrix |
| 10 Leaderboards | Casual trust, aliases, durable outbox, identity reconciliation and bounded reads |
| 11 Daily/expiry | UTC identity, immutable resolved schedule, five-day eligibility and access cleanup |
| 12 Screens/inputs | Responsive HUD/editor, portrait/landscape, keyboard/gamepad/touch and emulated input/viewport matrix |
| 13 Accessibility | Semantic surrounding UI/editor, reduced motion/effects, focus and scoped claims |
| 14 Scenes/audio | Four motifs, held readable endings, later no-animation-toggle preference and bounded audio |
| 15 Performance | Explicit budgets, cold-path warmup, pools and context-loss recovery |
| 16 Brand/assets | Art tokens, silhouette, favicon/install/social assets and source/license inventory |
| 17 Sharing | Complete invitation, capability-based fallbacks, honest rank and complete sharing fallback checks |
| 18 Offline/updates | Complete integrity inventory, client release pinning, recoverable transactions and A-to-B lab |
| 19 Installation/fullscreen | Separate installed/API/CSS states and available browser evidence |
| 20 Release | Immutable staging, preserved content/policies, required CI, readback and rollback |
| 21 Complete review | Journeys, independent oracles, all-content enumeration and automated/browser acceptance |
| 22 Incidents/audit | Append-only plans, exact failures, scoped diff/hashes and root-cause records |
| 23 Genre adaptation | Racing-specific corridor/gate/AI invariants; asynchronous competition boundary |
| 24 Templates | This milestone/acceptance ledger plus runtime release checklist |
| 25 Corrections | Trusted DAV, access-driven expiry, qualified environment limits and unresolved activation carried forward |
| 26 Source mapping / Appendix A | Governing 23-rule mapping below; source links in README and audit |

| Document-first rule | Concrete application |
| --- | --- |
| 1 Domain first | Tracks, pieces, parts, builds, cups, runs and drafts |
| 2 Resources | Independent definition URLs and clear lifecycles |
| 3 Meaning | Typed semantic HTML and explicit application vocabulary |
| 4 Authority | Resource ownership map; generated runtime never edited manually |
| 5 Identity | Permanent IDs distinct from order, slug and revisions |
| 6 Composition | Validated native routes and shared shells |
| 7 Provenance | Editor writes the known source, preserving baseline and ETag |
| 8 Separation | Documents, platform rules, simulation, presentation and CSS have named responsibilities |
| 9 Interfaces | Request/fact event semantics, ordering, cancellation and errors |
| 10 Extension | Reviewed bounded recipes with schema/compiler/help/tests |
| 11 Editor | Shared parser/compiler, real test drive and official-track authoring |
| 12 Authority and relationships | Single-document owned geometry; release-level reference validation; distinct public enforcement and trusted DAV |
| 13 Recovery | History, committed drafts, conflicts, ambiguous-write reconciliation and outbox |
| 14 Releases versus content | Immutable official snapshots and preserved mutable Workshop resources |
| 15 Accessible enhancement | Native surrounding controls and explicit renderer/error states |
| 16 Performance | Boundary parsing, analytic geometry and bounded runtime representations |
| 17 Offline state | Cached published snapshot, draft, queued run and confirmed record stay distinct |
| 18 Suitable native features | Verify actual supported operations before enabling dependent capabilities |
| 19 Exceptions | Binary ghost, buffers, audio, physics and browser stores have documented purposes |
| 20 Evidence | Exact-revision acceptance, independent invariants and provider/browser journeys |
| 21 Explanation | Track lifecycle and ownership documented across the package |
| 22 Qualified benefits | Structure enables reuse; validation, accessibility and security still need implementation/evidence |
| 23 Incremental work | Milestone 2 integrates editor early; useful prior patterns retained without assuming a drop-in code transplant |

## Design review and remaining evidence

Before delivering this package: check document links, agreed counts, part references, milestone unlock arithmetic, mode rules, geometry restrictions, authority wording, later standing preferences and mockup controls/layout. Record those checks in the audit. Review visual screens at desktop and narrow width; clearly label illustrative timing/stat values.

During implementation, review these player contracts and challenge the simulation and recovery assumptions. Required runtime and provider checks remain Not run until performed on the resulting game. Physical hardware, human playtesting and listening sessions are outside required release scope; do not list them as outstanding acceptance gates.
