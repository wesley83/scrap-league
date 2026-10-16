# Scrap League acceptance and implementation plan

## Delivery boundary

The design package defines a complete first release, including the Track Workshop. Implementation is complete only when the player journeys below have evidence on the exact release revision. The visual study demonstrates layout and selected interface responses; it does not prove physics, track validity, persistence, publishing or real-device behavior.

Use status values Passed, Failed, Not run, Blocked and Accepted exception, always with revision, environment and evidence. All runtime acceptance rows begin **Not run**. A design review or test count does not convert those rows to Passed.

## Implementation sequence

| Milestone | Concrete deliverable | Exit criteria |
| --- | --- | --- |
| 1 · Model and handling laboratory | Shared schemas, parser/serializer/compiler, independent geometric fixtures, one car and a loop | Clean source regeneration; round-trip integrity; swept collisions, skidpad/slalom/braking checks; input/pause/recovery state contracts |
| 2 · Integrated race and Workshop | Six-car race, modular road editor, surface/prop/gate tools, real test drive, history and drafts | A new track can be built, validated, driven, recovered and exported/imported through the UI; one complete keyboard/touch-emulated journey |
| 3 · Garage and full content | All 81 builds, twelve circuits, four cups, eight rivals, unlocks and results | Official tracks authored in Workshop; all references resolve; all tracks finish under seeded AI; human handling/pacing review begins |
| 4 · Resilient player experience | Saves, ghosts, daily definitions, offline pack, install/fullscreen, audio and sharing | Transaction/failure tests; genuine offline relaunch; natural update journey; phone layouts and keyboard focus |
| 5 · Pagelove integration | Native composition, owner publication, discovery index, casual boards | Correct-host readback, ETag conflict and ambiguous-write recovery; supported public-policy activation and positive/negative record checks |
| 6 · Release candidate | Complete asset pack, required CI, audit evidence, release/rollback tools and human/device review | All required rows pass or have explicitly accepted scoped exceptions; exact package verified and previous-client update succeeds |

Milestone 2 is the first playable slice. It includes the editor from the beginning. Milestones are dependency gates rather than unsupported calendar estimates. The shared board's provider activation dependency must be resolved before enabling that feature in a public release.

## Required player journeys

| ID | Journey and expected outcome | Evidence method |
| --- | --- | --- |
| J01 | Fresh player loads, learns the controls, starts and finishes Yard Loop without an account | Real browser recording plus novice observation |
| J02 | Player pauses, opens settings, returns, resumes and immediately steers without a focus/input surprise | Keyboard-only and gamepad/touch review |
| J03 | Player completes a three-race cup, reloads between rounds, and keeps exactly one set of rewards | Storage transaction assertions and UI journey |
| J04 | Player completes all twelve events with ordinary inputs/resources and sees the held final scene | Seeded full campaigns plus human observation; no forced finish fixture as a substitute |
| J05 | Player compares and equips a part, tests it and can explain its tradeoff | Bench measurements and player comprehension review |
| J06 | Player finishes a Time Trial, sees correct lap arithmetic, races a compatible ghost and improves a best | Independent timing fixtures and UI journey |
| J07 | Player starts before UTC midnight, finishes after it, uploads later and remains on the original challenge | Injected calendar/network boundaries and recorded challenge identity |
| J08 | New creator builds a closed circuit, corrects a gap, places gates and drives a valid lap | Pointer and keyboard/list workflows, then real touch |
| J09 | Creator tests against five AI, returns to exact editor context, undoes, reloads and recovers work | UI plus stored-revision assertions |
| J10 | Creator exports, imports and gets identical gameplay meaning without executing hostile content | Canonical round trip and adversarial inert-import fixtures |
| J11 | Two owner editors conflict; stale editor preserves work and never overwrites the newer track | Disposable real provider document with conditional writes |
| J12 | Published track succeeds but catalog update conflicts; exact link works and listing retry is safe | Provider fault fixture and readback |
| J13 | Player downloads complete content, stops the server, cold-relaunches and races/edits offline | Actual browser/worker cold relaunch, then installed phone |
| J14 | Existing release discovers a new version naturally and updates between runs without losing state | Two-version browser lab and physical installed app |
| J15 | Score submission times out after server acceptance; original ID reconciles once across two tabs | Durable outbox and disposable provider evidence |
| J16 | Graphics context is lost, phone rotates or input disconnects; invisible simulation stops and explicit resume works | Browser fault injection plus device interruption |
| J17 | Result/track invitation contains useful text and link; canceled share preserves state | Payload check plus authorized real receiving-app test |
| J18 | Reduced-motion, muted and low-effects players can finish and read every transition/result | All scene families, real listening and readability review |

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
| P08 | Policy activation | Supported provider procedure and readiness evidence; source ETag/OPTIONS/warmup are not substituted for enforcement readiness |
| P09 | Data-preserving release | Populated Workshop, catalog, boards and old-client assets survive; no duplicate live schema declarations in immutable bundles |

Use synthetic aliases and disposable resources. Keep sanitized request/status/body evidence, correlation identifiers when present, UTC timestamps and positive/negative controls. Delete only fixtures owned by the experiment and verify cleanup. Repeated intermittent failures remain in the record even if retry succeeds.

## Browser and device matrix

| Surface | Required checks | Initial status |
| --- | --- | --- |
| Desktop Chromium at 1440×900 and 1024×768 | Complete keyboard journey, gamepad, resize, multi-tab storage/update, focus and context recovery | Not run |
| Desktop Firefox | Game, Workshop, audio activation, offline restart, clipboard/share fallback and native route | Not run |
| Desktop Safari where available | Module/render support, storage, audio, download and share fallback | Not run |
| Android Chromium browser and installed app | Real touch, safe areas, rotation, background/termination, fullscreen, thermal/performance and update | Not run |
| Android Firefox browser and installed app | Installation guidance, available fullscreen, layouts, worker/recovery and share behavior | Not run |
| iPhone/iPad Safari and home-screen mode | Actual installed geometry, storage/termination, virtual keyboard, audio and available sharing | Not run |
| 320 px portrait and short 667×320 landscape emulation | No clipped controls/dialog actions, long names, validation list, HUD/road separation | Not run; emulation does not certify devices |
| 200% text/zoom, keyboard and screen reader | Menu/garage/editor/result semantics, focus order, labels, validation and dynamic announcements | Not run |

Record exact OS, browser version, hardware, input method, tab/installed/fullscreen state and tested release. The previous game's Android upper-strip observation remains historical evidence; do not claim this game's geometry is fixed without measuring it. UI preference forbids decorative northeast arrows and colored accent side rails. Verify that no later visual polish reintroduces them.

## Human balance and audio review

Recruit at least three novice and three experienced arcade-racing players for a formative round across keyboard/gamepad and touch; this is a small usability sample, not statistical proof. Observe the first race, one mixed-surface event, one final-cup race and a create–test editor journey. Record completion, retries, active time, confusion, perceived unfairness, fatigue and desire to retry. Seek explicit explanations of the garage tradeoffs and how to recover a missed checkpoint.

Initial targets: at least five of six participants start driving without help; at least four can finish the first Club race within two attempts; every participant can locate Reset and Resume; at least four can construct/test the starter-loop modification without intervention. Investigate misses rather than tune solely to a pass count. Review novices and touch users separately even with a small sample.

Listen to every engine/surface combination, all four music motifs, collisions/boost overlap, long play, pause/resume and victory transitions on speakers and headphones. Numeric peak/nonfinite checks are required but do not establish pleasant loudness or freedom from fatigue. Confirm sound-off users receive the same essential information.

## Performance and update acceptance

Measure the budgets in ARCHITECTURE.md on the stated baseline devices. Include cold first collision, first pad, every car part, max-track editor validation, repeated race/editor switching and 20 minutes of play. Record p95/p99 frame time, long tasks, memory trend, effect counts, download bytes and load timings. Lower quality can reduce presentation cost but never change route, AI, physics, timer or scoring.

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
| 6 Engagement | Car tradeoffs, contextual lessons, quick retry, named rivals and completion; human review |
| 7 Balance | Twelve-track teaching/pacing map, all-build bench fixtures and cohort observation |
| 8 Scoring/fairness | Exact race time, cup arithmetic, tiebreaks and comparison keys |
| 9 Effect interactions | Explicit boost/pad/surface/reset precedence and interaction matrix |
| 10 Leaderboards | Casual trust, aliases, durable outbox, identity reconciliation and bounded reads |
| 11 Daily/expiry | UTC identity, immutable resolved schedule, five-day eligibility and access cleanup |
| 12 Screens/inputs | Responsive HUD/editor, portrait/landscape, keyboard/gamepad/touch and real device matrix |
| 13 Accessibility | Semantic surrounding UI/editor, reduced motion/effects, focus and scoped claims |
| 14 Scenes/audio | Four motifs, held readable endings, later no-animation-toggle preference and bounded audio |
| 15 Performance | Explicit budgets, cold-path warmup, pools and context-loss recovery |
| 16 Brand/assets | Art tokens, silhouette, favicon/install/social assets and source/license inventory |
| 17 Sharing | Complete invitation, capability-based fallbacks, honest rank and real receiving-app check |
| 18 Offline/updates | Complete integrity inventory, client release pinning, recoverable transactions and A-to-B lab |
| 19 Installation/fullscreen | Separate installed/API/CSS states and device evidence |
| 20 Release | Immutable staging, preserved content/policies, required CI, readback and rollback |
| 21 Complete review | Journeys, independent oracles, all-content enumeration and human/device acceptance |
| 22 Incidents/audit | Append-only plans, exact failures, scoped diff/hashes and root-cause records |
| 23 Genre adaptation | Racing-specific corridor/gate/AI invariants; asynchronous competition boundary |
| 24 Templates | This milestone/acceptance ledger plus runtime release checklist |
| 25 Corrections | Trusted DAV, access-driven expiry, real-device limits and unresolved activation carried forward |
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
| 20 Evidence | Exact-revision acceptance, independent invariants and provider/device journeys |
| 21 Explanation | Track lifecycle and ownership documented across the package |
| 22 Qualified benefits | Structure enables reuse; validation, accessibility and security still need implementation/evidence |
| 23 Incremental work | Milestone 2 integrates editor early; useful prior patterns retained without assuming a drop-in code transplant |

## Design review and remaining evidence

Before delivering this package: check document links, agreed counts, part references, milestone unlock arithmetic, mode rules, geometry restrictions, authority wording, later standing preferences and mockup controls/layout. Record those checks in the audit. Review visual screens at desktop and narrow width; clearly label illustrative timing/stat values.

During implementation, obtain a reviewer who starts from these player contracts and challenges the simulation and recovery assumptions. Self-review, an AI review and human usability review establish different evidence and must remain distinguishable. Every runtime, provider, hardware, listening and human balance check remains Not run until performed on the resulting game.
