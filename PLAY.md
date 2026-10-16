# Play Scrap League

Scrap League is now a playable local browser game with a bundled Track Workshop. This is the first implementation release, **0.1.0**. The original design documents remain the intended full release contract; the evidence and remaining differences are recorded below rather than being silently treated as complete.

## Start

Run `START-GAME.cmd`, or run `node tools/serve.mjs` from this directory, then open **http://127.0.0.1:4390**. Node.js is required for the local server; the prebuilt game needs no package installation. The server serves only `dist/` on this computer. Keep that terminal running for browsers that have not installed the offline pack.

After the footer says **Offline pack installed**, that browser can reopen the game and Workshop without the server. Browser storage is specific to the browser/profile and origin. Export important tracks as HTML before clearing browser data.

For source development, install the pinned dependencies with `bun install --frozen-lockfile`, then run `node tools/build.mjs` and `node --test tests/*.test.mjs`. `dist/` is derived. The build reads authoritative `content/*.html` documents and cannot silently regenerate them from an old runtime bundle.

## Drive

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate / brake, then reverse | W / S or up / down | Right / left trigger |
| Steer relative to the car | A / D or left / right | Left stick |
| Handbrake | Space | A |
| Boost | Shift | B |
| Reset at the last checkpoint | R or Reset button | On-screen Reset |
| Pause | Escape or Pause | Start |

Touch controls can be enabled in Settings: a steering pad or left/right buttons, Brake, Slide and Boost. Enable Auto accelerate for touch. Auto accelerate and steering assistance are captured at the next race start and separate personal-best comparisons. A reset costs two seconds while opponents and the clock continue. Gold markers show checkpoints; the map highlights the next required gate. Crossing an out-of-order or backward gate does not advance the lap.

The car uses actual part mass, engine force/power/governor, tire surface grip and utility behavior. There is no repair currency. A podium is useful, but any completed League round advances the collection. Replays preserve the current cup; Restart cup is explicit. An interrupted League attempt restarts its uncompleted round, not an exact mid-race position.

## Included

- Twelve circuits, four three-race cups, five AI rivals per race, three difficulties, eight rival profiles, medals and eight part unlocks.
- Four assembly slots and 81 build combinations. Workshop tests can use every part immediately; League and Time Trial require unlocked parts. Twelve named local presets.
- League, Time Trial, UTC Daily Spec, a driving lesson and Workshop tests. The bundled daily edition covers September 16, 2026 through January 14, 2027 inclusive. Past dates remain their own edition; outside its range, Time Trial and Workshop remain available.
- Local bests with compatible noncolliding ghosts, split times, results, download/share fallbacks, transactional progression and persistent drafts.
- Procedural 3D cars/yard scenery, three surfaces, boost pads, barriers/scrap islands, synthesized engine/music, mute and reduced-motion/effects settings.
- Hash-verified complete offline packs, immutable release folders and explicit safe-start-screen updates. Cached prior assets and user data are retained.

## Build a track

Open **Track Workshop → Files**. Start with an official circuit copy or choose New blank track. Append connected roads, use the object list and numeric inspector to edit them, connect the last piece to the first, then select Suggest gates & grid. Validation explains gaps and other problems before Test drive becomes available.

A small working example: Start straight (60 m), right Hairpin (20 m radius), Straight (60 m), right Hairpin (20 m radius), Connect last to first, Suggest gates & grid. This creates a 246 m loop. Add surfaces or objects, set Test laps, then Test drive. Pause → Return to editor restores the working draft and its history.

Canvas tools select, pan, place pads/barriers/islands and zoom. The object list and numeric fields also edit road geometry, props, gates, six grid positions and respawns. Place object on selected road works without pointer placement. Undo/redo stores up to 100 commands within 10 MiB. Draft commits retain two preceding snapshots; Files → Recover previous save restores one as an undoable change. Files also offers recoverable seven-day Trash. A conflicting save in another tab is rejected and retains the in-memory draft for export.

**Export HTML** writes a full inert track document, including its owned geometry. **Import HTML** validates and previews before opening a new copy. Incomplete drafts can be exported; unsupported executable content and unknown schema fields are rejected. Exporting a track does not publish it online.

## Evidence and limits

See [implementation status](IMPLEMENTATION-STATUS.md), [test output](audit/final-tests.txt), [final regression checks](audit/final-regressions.txt), [six-car simulation evidence](audit/simulation-races.json), [browser review](audit/browser-game-review.json), and the [implementation audit](audit/2026-10-16-implementation.md).

The local game and editor work without a Pagelove credential. Online boards, native composition routes, discovery/catalog writes and owner publishing have not been connected to a selected host. `app/pagelove.js` contains a conditional authoring adapter with conflict/ambiguous-response/readback fixtures; those fixtures do not certify a real provider. WebDAV remains trusted owner authoring and intentionally bypasses platform validation/triggers.

Physical-phone, real-gamepad, Firefox/Safari, audio listening, accessibility assistive-technology and human balance reviews remain outstanding. This package is playable and reviewable; it is not a claim that the full production release gate in ACCEPTANCE.md has passed.
