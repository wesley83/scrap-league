# World workshop

Open [the workshop](https://sane-guild-8399.onpagelove.com/editor/prism-garden), or choose **Open world workshop** from the game's Worlds chooser. Each world has its own route, such as `/editor/dawn-nexus`.

## Document-first model

See [the architecture guide](DOCUMENT-FIRST-ARCHITECTURE.md) for the complete contract and standards mapping. Schema 2 stores permanent world identity, metadata, scene/music selections, formations and retained next-brick IDs. Campaign order belongs to the HTML catalog. Official runtime metadata and layouts are generated together.

Unknown editor URLs require an explicit world selection. Failed reads offer recovery choices and keep publishing disabled when the draft has no confirmed published baseline. The World details panel edits names, instructions, story, palette and supported scene/music presets. These use undo/redo, draft saving, export and the actual Practice model.

## Editing and play

Select a world and formation. Select & move lets you inspect a brick and drag it on the grid. Arrow keys move a selected brick by 0.1 units. Add bricks paints grid cells; Erase or Delete removes a brick. The inspector edits its type, hit points, color, position and movement. Undo/redo retain up to fifty changes. Movement and one base specialization can be combined with one custom recipe. Multiple custom recipes on a single brick are rejected clearly.

Changes save automatically as a local draft. Download world exports a complete HTML document; Import world validates and rebuilds one for the same world. Inspect HTML shows the exact structure. Restore original restores the release layout and can be undone; Reload published retrieves the shared layout and can also be undone.

Play this formation runs the actual Three.js renderer and fixed-step engine. Pointer/arrow keys move the paddle and Space launches. The preview displays score/lives and a short strike-event log. It never submits a leaderboard score.

Published edited layouts are available through the game's Practice world chooser. Adventure and Daily Challenge use the official bundled layouts. This keeps community editing from silently changing leaderboard difficulty or an active Daily Challenge.

## HTML data

Worlds live at `/worlds/<slug>/definition.html`. The world, formation, row, brick, barrier and portal are microdata items, rather than JSON inside code elements:

```html
<div id="world" itemscope itemtype="urn:world">
  <meta itemprop="slug" content="prism-garden">
  <meta itemprop="schemaVersion" content="2">
  <meta itemprop="id" content="prism-garden">
  <!-- Other required metadata is omitted from this abbreviated example. -->
  <meta itemprop="name" content="Prism Garden">
  <meta itemprop="note" content="Catch falling power-ups.">
  <section id="formation-0" itemprop="formation" itemscope itemtype="urn:Formation">
    <meta itemprop="phase" content="0">
    <div id="f0-row-0" itemprop="row" itemscope itemtype="urn:Row">
      <meta itemprop="schemaVersion" content="2">
  <meta itemprop="id" content="prism-garden">
  <!-- Other required metadata is omitted from this abbreviated example. -->
      <meta itemprop="x" content="-5.79">
      <meta itemprop="y" content="9">
    </div>
    <div id="f0-brick-0" itemprop="brick" itemscope
         itemtype="urn:Brick urn:Brick:Armor urn:Brick:Moving">
      <meta itemprop="id" content="0">
      <meta itemprop="row" content="f0-row-0">
      <meta itemprop="hitpoints" content="2">
      <meta itemprop="color" content="#b5ff6c">
    </div>
  </section>
</div>
```

The snippet above illustrates structure, not a complete importable file. Download world or inspect a checked-in definition for all required fields. The parser can inherit x/y from the referenced row. The serializer writes explicit coordinates, dimensions and movement origin to preserve current formations exactly. The checked-in catalog and HTML documents are also the official metadata and layout source: `build-bundled-worlds.mjs` validates them and generates complete offline world definitions used by `makeLevel` and the interface, so there is no parallel position-generation algorithm. Hosted edits do not change that reviewed release snapshot. Validation limits each formation to 1–80 bricks, 1–3 hit points, sixteen barriers and either zero or two portals. Type definitions and behavior settings have bounded values. Import reconstructs clean HTML from validated records, removing scripts, composition directives and unsupported attributes.

The editor's visible bricks are these HTML elements. CSS targets their types with token selectors, for example `[itemtype~="urn:Brick:Moving"]`. `world-data.css` also demonstrates these specializations when viewing a data document directly.

## Native Pagelove routing and templates

The publisher stores the route template at the literal `/editor/:worldname` path. Whole-document GETs capture the concrete name in `Context.request.params.worldname`. A reusable `urn:PrismBreaker:EditorTemplate` schema method validates it against the sixteen supported slugs and returns a native `p:include` of `#world` from that world's document. Another native include composes the shared editor shell from `/editor-template.html`.

This uses native parameter routing, schema methods, server-side JavaScript, composition and fragment provenance. `/worlds.html` is now an aggregate of sixteen native includes. It contains no JSON-in-code brick records.

Live implementation checks found Liquid interpolation in an include resource unreliable, dynamic Sessel `from` unsupported at storage level, and `Selector.execute` unavailable in this deployed runtime. The small schema method plus native include worked, including at the full editor size. The audit preserves the failed attempts.

## Invented brick types and events

The type builder creates names such as `urn:Brick:Custom:solar-flare`, with a base regular/armored/explosive/switch specialization. Its additional break recipe can award points, damage nearby bricks, open gates, slow the ball, drop a power-up, or use only the base behavior. Recipes are data, not executable scripts.

Every engine impact dispatches a cancelable `strike` event before damage; `brickdamage` reports the resulting hit points, and `brickbreak` reports destruction. `attachBrickDOM` forwards strike, damage and brickbreak events to the matching HTML brick, including bubbles through its formation/world. It updates `data-remaining-hitpoints` and a destroyed class. The main game mounts a sanitized hidden `#game-world-model` in Adventure, Daily and Practice, with the active phase and current remaining hit points. The model refreshes on formation/world changes and checkpoint resume. The 3D renderer continues to display cracks and remaining hits.

Trusted application code can add genuinely new processing through the registry and event API:

```js
game.behaviors.register('urn:Brick:Custom:example', {
  onStrike({game, brick, chain}, event) {
    // Custom trusted processing before ordinary hit-point damage.
  },
  onBreak({game, brick}) {
    game.award(250);
  }
});

worldElement.addEventListener('strike', event => {
  // event.detail contains game, brick, chain and hitpoints.
  // event.preventDefault() cancels this strike's ordinary damage.
});
```

Handlers run synchronously in base, specialization, movement and custom-type order. Return false or cancel the supplied strike event to prevent damage; unsubscribe removes only that registration. Failures report brickbehaviorerror. These handlers belong in reviewed application code. Imported HTML cannot choose JavaScript source, URLs, imports, or eval. Adding an arbitrary new visual/physical primitive still requires a code extension; the recipe builder covers the supported combinations.

## Publishing and preserving edits

Publishing requires the existing host owner's key. The editor sends it only to the pinned DAV host, keeps it in the submit handler, clears the password field immediately, and never saves it in browser storage, drafts or exported HTML. Anonymous readers can make local drafts but cannot modify shared documents.

The publisher reads the current owner-side document and ETag, compares it with the canonical version loaded by the editor, then writes with If-Match. A concurrent change returns a conflict; download your draft and reload the shared version to review it. Successful writes are read back and compared. No wildcard overwrite or forced retry is offered.

`bun tools/build-worlds.mjs` validates source documents and rebuilds the native composition catalog; missing sources fail explicitly instead of being recreated from an old bundle. The publisher's `seedWorlds` operation creates missing live resources with If-None-Match and preserves existing ones. Normal deployment excludes every `/worlds/*/definition.html` file, so future releases cannot reset community edits. Score data remains excluded as well.

## Offline and verification

Opening the native workshop needs a connection. Editor code/styles are bundled locally. Practice falls back to a separately cached published document, then a saved draft, then the original release, with visible provenance. Official Adventure/Daily continue to work offline with their bundled definitions. Mutable world documents and composed editor HTML bypass the static release cache. A CSP-hashed bootstrap marks only the workshop client for network assets before loading its modules, so an older installed worker cannot strand the new editor while active game tabs remain pinned. Entry/style URLs are fingerprinted, and network clients bypass browser caching.

Focused checks cover all twenty world round trips, malformed definitions, stripped imported markup, custom type combinations, strike cancellation, DOM events and Practice isolation. Existing engine/paddle and worker/client checks complement editor browser review. See the release audit for exact results and remaining limits.

Build order after editor/data changes:

```sh
bun run build
bun tools/build-pwa.mjs --check
```

The local preview server serves `/editor/<slug>` from the editor shell and reads local world files. It does not emulate server composition or permit owner publishing. The deployed native route must also be reviewed.

## Server policy and release status

The generated world policy candidate lives in policy-candidates/, outside deployed assets. Its local checks require canonical, validated complete conditional PUTs, but the live DAV probe accepted invalid and unconditional writes. Separate triggers were confirmed to run on public GET requests; public owner-key PUT returned 401. Therefore the candidate is not active, and server-authoritative world validation remains a platform-dependent gap. The existing owner-only DAV path, editor validation, ETags and readback remain in use. Existing hosted v1 definitions remain readable and migrate on their next owner publication. No new public write permission is granted. Activation requires a passing probe against the actual DAV write path. See the [implementation audit](audit/2026-10-14-document-first-implementation.md).
