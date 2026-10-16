# Implementation status · Scrap League 0.1.0

## Implemented and exercised

The game has a shared HTML track model/compiler, a planar fixed-step simulation, 3D presentation, legal-input AI, twelve source circuits, four cups, 81 builds, garage unlocks/presets, daily/trial/lesson modes, race/result screens, local best ghosts and an integrated editable/testable Workshop. It builds from authoritative documents into versioned runtime assets. Mutating an editor draft cannot alter an active run's cloned track/build.

Automated checks cover semantic round trips, unsupported imports, geometry/topology errors, analytic arc length/endpoints, swept-wall examples, finite directed gates, out-of-order/reverse crossings, reset sequence preservation, exact timing arithmetic, pause behavior, DNF history, all-build acceleration/braking, campaign idempotence, daily schedule constraints and owner-write conflict/readback fixtures. Thirty-six six-car simulations cover all twelve tracks at three difficulties (three laps at Club; one at Relaxed/Expert), with a player controller issuing legal AI inputs. These are not human runs or UI automation that presses a finish button.

Browser review has exercised actual keyboard acceleration and gate charge, six-car race start, pause/resume/leave, a brand-new four-piece loop built through the UI, suggested gates/grid, a completed test lap of that loop through normal driving controls, surface paint/undo/redo, draft recovery, HTML export/import preview and new-copy import, numeric spawn inspection, garage saving and natural service-worker updates preserving stored drafts. With the local HTTP server stopped and confirmed unreachable, the installed game reloaded, restored the edited circuit and launched another real test drive. Desktop and 320-pixel layouts were inspected. The [browser evidence receipt](audit/browser-game-review.json) records final observations and untested cases.

## Differences from the full design

These are explicit implementation boundaries, not accepted production exceptions:

| Design area | Current state |
| --- | --- |
| Online Pagelove services | A host is now selected for game/static-content deployment; see DEPLOYMENT.md and the publication receipt. Boards/outbox/retention, native routes, discovery catalog and owner publish UI are not enabled. The isolated Workshop owner adapter is tested against fixtures only. |
| Workshop advanced tools | Individual pieces/objects, automatic connector placement, numeric transforms, editable gates/grid, full-piece surface painting, history, seven-day recoverable local trash and import/export work. Multi-selection/group transforms, partial-width patch editing UI, custom recipe authoring and a separate technical-loop template remain future work. Unsupported recipes are rejected explicitly. |
| Official authoring provenance | All official source exports use the same placement/setup/serialization modules as Workshop and round-trip losslessly. They were initially authored with the shared CLI, not manually constructed through every UI interaction. A new circuit was constructed through the UI during review. |
| Exact collision solver | Road sweeps use the capsule's end/midpoint circles, with bounded iterative wall resolution; car contacts use capsule closest-point impulses at 120 Hz. A complete continuous rotating-capsule, combined wall/car chronological solver and adversarial proof suite remain beyond this release. |
| Balance/AI | Fixed legal inputs, curvature braking, lane variation, obstruction avoidance and reset recovery work. No rubber-band physics. Designed reaction-delay/mistake profiles, eight-minute real human sessions and comparative difficulty tuning need further review. |
| Art/cinematics | Procedural low-poly assets, garage assembly and held results work. No external media/CDN. Full bespoke environment/animation pack, campaign restoration cinematic, bundled licensed fonts, maskable PNG install icons and social-card image generator are not delivered. |
| Offline updates | Hash-verified complete installation, immutable assets and explicit safe-screen activation are implemented. Prior caches are retained to preserve old clients. Full quota/corruption/multi-client fault laboratory and cache retirement policy remain outstanding. |
| Recovery | Atomic local progression/best/ghost writes, draft CAS and two prior snapshots work. Storage failure retains in-memory work and download options. Schema migrations, full backup/import, cross-tab lease outbox and all quota/transaction fault tests are outstanding. |
| Accessibility/devices | Semantic menus/dialogs, labeled numeric editor, keyboard/touch/gamepad code, mute and reduced-motion controls exist. Canvas racing is visually driven. Physical touch/gamepad, screen reader, 200% zoom, Firefox/Safari and long-session device measurements are not certified. |

The game is a local implementation release, not the complete public release described by the approved design. Human balance/listening reviews and provider/device gates must be completed before advertising those broader guarantees. The intended design remains intact for subsequent work.

## Reproduction and ownership

`content/` owns authored definitions. `app/` owns the parser, compiler, simulation, UI, renderer, storage and disconnected provider adapter. `tools/build.mjs` validates all official relationships and emits `dist/` with a SHA-256 inventory. `tools/author-content.mjs` is an authoring utility, never part of a normal build; rerunning it intentionally replaces official content and must be reviewed. `tools/add-crusher-obstacles.mjs` records the subsequent island-authoring operation.

The original design package remains unchanged in the authoring workspace. Runtime/source packaging is separate. The initial implementation review made no provider writes; subsequent user-authorized Git publication and Pagelove deployment are recorded separately in `audit/2026-10-16-publication.md`. No other game is modified.
