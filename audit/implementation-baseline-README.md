# Scrap League game design

Scrap League is an arcade racing game about assembling a scrappy little car, learning short circuits, and creating new circuits in a bundled Track Workshop. The first release pairs six-car races with a complete track editor; the same track documents drive racing, editing, previews and exports.

**Status:** Design specification and interface study. The game and production editor have not been implemented. Numeric handling, balance and performance values are initial targets that require the acceptance work below. Created October 15, 2026, America/New_York.

## Read the design

1. [Game design](GAME-DESIGN.md): player promise, modes, driving, vehicle building, progression, presentation, input and recovery.
2. [Content catalog](CONTENT-CATALOG.md): twelve circuits, four cups, vehicle parts, opponents, teaching and pacing.
3. [Track Workshop](TRACK-WORKSHOP.md): the bundled editor, geometry contract, tools, validation, test driving and publishing.
4. [Architecture](ARCHITECTURE.md): Pagelove documents, ownership, schemas, simulation, behavior contracts, storage, offline operation and releases.
5. [Acceptance and implementation plan](ACCEPTANCE.md): delivery milestones, test oracles, target devices, release gates and coverage of the documented best practices.
6. [Interface study](design-review.html): navigable visual design for the start screen, garage, race HUD and workshop. This is a design prototype, not a playable race or publishing tool.

## Product decisions

- Elevated orthographic 3D presentation over a planar, fixed-step racing simulation.
- Twelve authored circuits in four cups; one player and five computer drivers.
- Four interchangeable assembly slots with three choices each: 81 possible builds.
- Campaign, Time Trial, Daily Spec and Workshop modes. The editor and every editing tool are available immediately.
- Track geometry uses connected modular pieces, three driveable surfaces and bounded obstacle recipes.
- Local progress and drafts; owner-authorized track publishing; casual shared times through a separate validated application path.
- Immutable official race definitions; edited tracks start a distinct revision and never alter an active race.
- Offline play and editing after a verified complete download; confirmed shared writes require a connection.

## Design authority

This package applies snapshots of the [Pagelove document-first standard](references/DOCUMENT-FIRST-DEVELOPMENT.md) and the [game development handbook](references/GAME-DEVELOPMENT-BEST-PRACTICES.md). It adapts the [previous editor architecture](references/PRISM-BREAKER-ARCHITECTURE.md), including the support-confirmed distinction between trusted WebDAV authoring and validated application writes. [Reference provenance](references/README.md) identifies their canonical sources and precedence.

Within this package, GAME-DESIGN owns player-facing rules, CONTENT-CATALOG owns initial content and tuning tables, TRACK-WORKSHOP owns editing and track geometry, ARCHITECTURE owns persistence and runtime contracts, and ACCEPTANCE owns evidence requirements. Resolve a conflict by correcting the dependent document and recording the change; do not silently introduce a second rule.

The [audit](audit/2026-10-16-design.md) records the scope, changes and verification. No deployment destination has been selected, and no hosted changes are implied by this design.

## Open the interface study locally

Open `design-review.html` directly, or run `node preview.mjs` from this directory and visit `http://127.0.0.1:4387`. The preview server binds only to the local machine. Run `node review-design.mjs` for the package's structural link, identity and syntax review; these checks do not test a game engine.
