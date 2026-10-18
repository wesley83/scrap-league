# Scrap League

Scrap League is an arcade racing game about assembling a scrappy little car, learning short circuits, and creating new circuits in a bundled Track Workshop. This local release pairs six-car races with an integrated track editor; the same track documents drive racing, editing, previews and exports.

**Status:** Playable local implementation 0.1.0 with the bundled Track Workshop. Open [Play and run instructions](PLAY.md) to start the game, and [implementation status](IMPLEMENTATION-STATUS.md) for tested behavior and the remaining full-release requirements. The approved design below remains the intended product contract.

**[Play Scrap League on Pagelove](https://hire-poker-8313.onpagelove.com/)** · [Public source repository](https://github.com/wesley83/scrap-league)

## Play the game

Run `START-GAME.cmd`, or `node tools/serve.mjs`, then open http://127.0.0.1:4390. The game includes twelve circuits, four cups, 81 builds, six-car races, Daily Spec, Time Trial, local progress/ghosts, shared casual Trial/Daily times and a working track editor. The current prebuilt game is included in `dist/`. The selected Pagelove site and publishing procedure are in [deployment instructions](DEPLOYMENT.md). Shared boards use separate per-game native documents, server-validated record shapes and server-assigned five-day expiry; modified clients can still submit fabricated times. [The deployment receipt](audit/deployment.json) identifies the last completed publication; publication does not imply that every product acceptance row has passed.

## Read the design

1. [Game design](GAME-DESIGN.md): player promise, modes, driving, vehicle building, progression, presentation, input and recovery.
2. [Content catalog](CONTENT-CATALOG.md): twelve circuits, four cups, vehicle parts, opponents, teaching and pacing.
3. [Track Workshop](TRACK-WORKSHOP.md): the bundled editor, geometry contract, tools, validation, test driving and publishing.
4. [Architecture](ARCHITECTURE.md): Pagelove documents, ownership, schemas, simulation, behavior contracts, storage, offline operation and releases.
5. [Acceptance and implementation plan](ACCEPTANCE.md): delivery milestones, test oracles, target devices, release gates and coverage of the documented best practices.
6. [Interface study](design-review.html): navigable visual design for the start screen, garage, race HUD and workshop. This is a design prototype, not a playable race or publishing tool.

## Product decisions

- Overhead Canvas 2D presentation over a planar, fixed-step racing simulation, with a road-ahead camera and reserved touch-control space.
- Twelve authored circuits in four cups; one player and five computer drivers.
- Four interchangeable assembly slots with three choices each: 81 possible builds.
- One-action two-lap Quick Race, optional action-based Driving School, League, Time Trial, Daily Spec and Workshop. The editor and every editing tool are available immediately.
- Track geometry uses connected modular pieces, three driveable surfaces and bounded obstacle recipes.
- Local progress and drafts; owner-authorized track publishing; casual shared times through a separate validated application path.
- Immutable official race definitions; edited tracks start a distinct revision and never alter an active race.
- Offline play and editing after a verified complete download; confirmed shared writes require a connection.

## Design authority

The current [requirement follow-up](audit/2026-10-18-remaining-requirements/report.md) builds on the [handbook 2.10 audit](audit/2026-10-17-guide-2-10-audit/report.md), uses the [pinned 2.10.0 snapshot](audit/2026-10-17-guide-2-10-audit/governing-guide.md) and [current acceptance mapping](ACCEPTANCE.md#handbook-210-audit-adoption), and records the user's native-desktop exclusion and corrected policy-capability mapping. Older snapshots below preserve design provenance. `requirements.json` is the authoritative outcome/scenario inventory; `audit/current-acceptance.json` records the exact candidate's current verdict.

This package applies snapshots of the [Pagelove document-first standard](references/DOCUMENT-FIRST-DEVELOPMENT.md) and the [game development handbook](references/GAME-DEVELOPMENT-BEST-PRACTICES.md). It adapts the [previous editor architecture](references/PRISM-BREAKER-ARCHITECTURE.md), including the support-confirmed distinction between trusted WebDAV authoring and validated application writes. [Reference provenance](references/README.md) identifies their canonical sources and precedence.

Within this package, GAME-DESIGN owns player-facing rules, CONTENT-CATALOG owns initial content and tuning tables, TRACK-WORKSHOP owns editing and track geometry, ARCHITECTURE owns persistence and runtime contracts, and ACCEPTANCE owns evidence requirements. Resolve a conflict by correcting the dependent document and recording the change; do not silently introduce a second rule.

The [design audit](audit/2026-10-16-design.md) records the design scope, changes and verification. The later [publication audit](audit/2026-10-16-publication.md) records the user-authorized public repository and selected Pagelove deployment.

## Open the interface study locally

Open `design-review.html` directly, or run `node preview.mjs` from this directory and visit `http://127.0.0.1:4387`. The preview server binds only to the local machine. Run `node review-design.mjs` for the package's structural link, identity and syntax review; these checks do not test a game engine.
