# Play Scrap League

Scrap League is now a playable local browser game with a bundled Track Workshop. This is the first implementation release, **0.1.0**. The original design documents remain the intended full release contract; the evidence and remaining differences are recorded below rather than being silently treated as complete.

## Start

Play the hosted game at **https://hire-poker-8313.onpagelove.com/**. Progress and drafts stay in your browser; the owner deployment key is never required to play or edit local tracks.

Run `START-GAME.cmd`, or run `node tools/serve.mjs` from this directory, then open **http://127.0.0.1:4390**. Node.js is required for the local server; the prebuilt game needs no package installation. The server serves only `dist/` on this computer. Keep that terminal running for browsers that have not installed the offline pack.

After the footer says **Offline pack verified**, the complete game and Workshop are cached for offline use. Browser storage is specific to the browser/profile and origin. Export important tracks as HTML or save a full backup from Settings before clearing browser data. [Implementation status](IMPLEMENTATION-STATUS.md) records the exact offline verification scope.

For source development, install the pinned dependencies with `bun install --frozen-lockfile`, then run `node tools/build.mjs` and `node --test tests/*.test.mjs`. `dist/` is derived. The build reads authoritative `content/*.html` documents and cannot silently regenerate them from an old runtime bundle.

## Drive

Choose **LET’S RACE** for an immediate two-lap race against five rivals. **Driving school** is an optional one-lap practice: accelerate, steer, brake and boost to complete its checklist. **Leaderboards** opens public Time Trial and Daily times from the yard. Quick Race and practice never award League progression.

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate / brake, then reverse | W / S or up / down | Right / left trigger |
| Steer relative to the car | A / D or left / right | Left stick |
| Handbrake | Space | A |
| Boost | Shift | B |
| Reset at the last checkpoint | R or Reset button | On-screen Reset |
| Pause | Escape or Pause | Start |

Touch controls can be enabled in Settings: a steering pad or left/right buttons, Gas, Brake, Slide and Boost. Auto accelerate is optional. With manual throttle, the touch Boost button includes Gas so steering and boosting need only two contacts. Releasing it releases its throttle contribution; an independently held Gas button remains held. Auto accelerate and steering assistance are captured at the next race start and separate personal-best comparisons. A reset costs two seconds while opponents and the clock continue. Gold markers show checkpoints; the map highlights the next required gate. Crossing an out-of-order or backward gate does not advance the lap.

## Leaderboards and updates

Set your **Public driver name** from Leaderboards or Settings. It stays on this device and is used for future submissions. Finish three laps in **Time Trial** or **Daily Spec**, then select **Add to leaderboard**. Quick Race, League, practice and Workshop tests do not submit public times. Matching boards compare circuit, car, assists and rules; Daily also pins its UTC date.

You can enter your name and queue a result even when the board cannot load. The game shows **queued** only after the submission is saved locally, and **confirmed** after server readback. Queued runs retain their original name and identity. Use **Refresh / retry**, or Settings → Submission status → Retry connection. A server-requested delay is respected. Rejected times remain local and are not retried automatically; **Retry this time** explicitly checks that original submission again. Names allow 1–24 Unicode characters and render as text; entries expire five days after server receipt. No account or notification permission is required.

The PWA checks for new releases on startup, reconnect and return to the app, with repeated foreground checks limited to once a minute. **Update ready · review update** appears on the home screen when a verified pack is waiting. Apply it from the yard; every open game window must also be at a safe boundary. Settings → Check offline pack remains available. These are in-game update notices, not operating-system push notifications while the app is closed.

The car uses actual part mass, engine force/power/governor, tire surface grip and utility behavior. There is no repair currency. A podium is useful, but any completed League round advances the collection. Replays preserve the current cup; Restart cup is explicit. An interrupted League attempt restarts its uncompleted round, not an exact mid-race position.

## Included

- Twelve circuits, four three-race cups, five AI rivals per race, three difficulties, eight rival profiles, medals and eight part unlocks.
- Four assembly slots and 81 build combinations. Workshop tests can use every part immediately; League and Time Trial require unlocked parts. Twelve named local presets.
- League, Time Trial, UTC Daily Spec, a driving lesson and Workshop tests. The bundled daily edition covers September 16, 2026 through January 14, 2027 inclusive. Past dates remain their own edition; outside its range, Time Trial and Workshop remain available.
- Local bests with compatible noncolliding ghosts, split times, results, download/share fallbacks, transactional progression and persistent drafts.
- Shared casual Trial/Daily times with separate public boards, a durable retry queue, server-validated record shape and five-day retention. Public times are client-reported and can be forged; local records remain independent.
- Overhead numbered cars, road-ahead camera, three surfaces, boost pads, barriers/scrap islands, synthesized engine/music, mute and reduced-motion/effects settings. The racing view uses Canvas 2D without WebGL.
- Hash-verified complete offline packs, immutable release folders and explicit safe-start-screen updates. Cached prior assets and user data are retained.

## Build a track

Open **Track Workshop → Files**. Start with an official circuit copy or choose New blank track. Append connected roads, use the object list and numeric inspector to edit them, connect the last piece to the first, then select Suggest gates & grid. Validation explains gaps and other problems before Test drive becomes available.

A small working example: Start straight (60 m), right Hairpin (20 m radius), Straight (60 m), right Hairpin (20 m radius), Connect last to first, Suggest gates & grid. This creates a 246 m loop. Add surfaces or objects, set Test laps, then Test drive. Pause → Return to editor restores the working draft and its history.

Canvas tools select, pan, place pads/barriers/islands and zoom. The object list and numeric fields also edit road geometry, props, gates, six grid positions and respawns. Place object on selected road works without pointer placement. Undo/redo stores up to 100 commands within 10 MiB. Draft commits retain two preceding snapshots; Files → Recover previous save restores one as an undoable change. Files also offers recoverable seven-day Trash. A conflicting save in another tab is rejected and retains the in-memory draft for export.

**Export HTML** writes a full inert track document, including its owned geometry. **Import HTML** validates and previews before opening a new copy. Incomplete drafts can be exported; unsupported executable content and unknown schema fields are rejected. Exporting a track does not publish it online.

If saved drafts cannot be read, Workshop explains the problem and opens a separate copy with a new identity. Existing records stay unchanged. Files still opens if listing or an individual read fails, so you can export your current working track. A failed save remains unsaved until retry succeeds; exporting does not claim to save it on this device.

After a complete offline pack has been installed, circuit and editor links can recover from a network error, missing native page or selected server errors. The game identifies its installed circuit copy and keeps the requested link. Unknown links open a chooser. A first visit without an installed pack still needs the server to respond successfully.

## Evidence and limits

See [implementation status](IMPLEMENTATION-STATUS.md), [current automated tests](audit/remediation-final-tests.txt), [persisted campaign evidence](audit/remediation-persisted-campaigns.json), [acceptance ledger](audit/current-acceptance.json), and the [remediation audit](audit/2026-10-16-remediation.md). Older evidence remains preserved with its original release and limitations.

The local game and editor work without a Pagelove credential. Owner publication and discovery are implemented for the selected host, with conditional real-provider probes. Shared casual boards use native per-game server rules and a separate conditional provisioning operation; they do not make results authoritative or prevent modified clients from submitting fabricated times. The [deployment receipt](audit/deployment.json) records the last completed public asset/native-route readback. WebDAV is trusted owner authoring and intentionally bypasses platform validation/triggers.

Real-hardware sessions, human playtesting and perceptual listening are outside required scope by user instruction. Available-browser and automated checks remain required. This candidate does not yet pass every production release row in ACCEPTANCE.md.

If the racing view is blank, open **Settings → Repair graphics**. This rebuilds the view using safer graphics without erasing your progress. During a race, the clock stays paused until you choose Resume. Phones use safer graphics by default; the setting can also be toggled in Settings.
