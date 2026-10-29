# Scrap League Track Workshop

## Bundled product contract

Track Workshop ships with the first playable release and is available from the start screen. It uses the same validated track model, geometry compiler, car parts, collision shapes, surface rules and race state machine as the game. Every official circuit must be authored and exported through these tools before its release. This requirement prevents the editor from becoming a simplified demonstration that cannot express the real game.

Everyone can create, duplicate, edit, test, save drafts and import/export definitions. Shared publication initially uses the host owner's authorized WebDAV flow, following the previous game's trust model. Workshop never gives anonymous players an owner credential or claims that an exported file is already online.

## Workspace and journeys

The desktop workspace has a compact top command bar, a left tool palette, a large top-down editing canvas and a right selection inspector. A bottom status line shows selection, scale and draft state. The command bar contains track name, undo, redo, Test drive and a File menu for create/open/export/import/publish. Validation opens as a list with direct Select object actions.

On tablets, the inspector becomes a collapsible side sheet. On a narrow phone, the canvas remains primary; Tools and Inspector open bottom sheets, and Test drive stays reachable. Sheets never cover their own close/apply actions. Pointer gestures pan with two fingers and zoom with pinch; one pointer selects or places objects. A keyboard-accessible piece list and numeric inspector provide equivalent placement operations without requiring a drag.

### Create a track

1. Choose New track and one of Blank, Starter oval or Technical loop. The template is copied into a new track identity and never edits its source.
2. Snap pieces to the active connector. Green is accompanied by “Connected”; a dashed connector and “Gap” communicate incomplete geometry without relying on color.
3. Close the loop. The editor offers a valid completion only when it can find one within the supported piece vocabulary; it never silently moves existing pieces.
4. Place or accept suggested finish, checkpoints and grid spawns. Suggestions are editable and must pass the same validation as manual placement.
5. Choose surfaces, obstacles and a scene/music preset. The full width of drivable routes and solid obstacles is visible in the editor.
6. Run validation, test drive, return, refine, and save/export. The tutorial is complete after the player changes a surface and completes a valid test lap.

### Edit an existing circuit

Open creates a working draft tied to the exact source content and ETag when available. Official circuits open as editable copies with new IDs unless the owner explicitly opens an owner-managed Workshop resource. Selecting Duplicate always creates new track and object identities and records the source revision as optional provenance.

Editing a published track changes only the draft. A currently running race owns a complete immutable snapshot and continues unchanged. Successful publication makes the new revision available to future reads; it does not replace an active test or race.

## Tool inventory

| Tool | Pointer behavior | Keyboard/list equivalent | Undo unit |
| --- | --- | --- | --- |
| Select | Click/tap an object; Shift adds to selection; drag selection | Piece/object list, arrows to step selection | Selection is UI state, not document history |
| Road | Choose a piece, preview at active connector, place | Select connector, choose piece, press Place | One placement with its explicit connection |
| Move | Drag a free object or detached road group on grid | X/Z fields and arrow nudges | Complete gesture, not each pointer event |
| Rotate | Rotate selected group in 90° steps | Rotate left/right buttons and shortcuts | One group transform |
| Surface | Place a bounded patch associated with a road piece | Choose piece, start/end distance and lateral span | One patch or completed drag |
| Props | Place tire barrier, scrap island or boost pad | Object type plus position/rotation fields | One object |
| Gates | Add/move finish or checkpoint along a road piece | Ordered gate list and piece/distance fields | One gate edit or reorder |
| Grid | Place six start positions and inspect respawns | Spawn list and numeric position/heading | One spawn edit or accepted suggestion batch |
| Erase | Delete selected objects with dependency explanation | Delete action; shortcut ignored in text fields | One validated deletion batch |
| Inspect | Show dimensions, references and canonical HTML preview | Same inspector controls | Edits commit on Apply/Enter/blur when valid |

Undo and redo retain 100 committed edits or a 10 MiB history budget, whichever is reached first. When pruning, retain the current valid document and a visible earliest-history boundary. Drag cancellation restores the pre-gesture state. Invalid text remains visible with an error and never overwrites the last valid numeric value. Undo restores object IDs, connections and metadata consistently.

## Road geometry contract

The world uses X/Z horizontal coordinates in meters, Y=0 for the driving plane, and counterclockwise headings in radians internally. Display angles are degrees. The visible road and collision corridor come from one canonical centerline and width profile.

| Piece type | Parameters | Connectors and restrictions |
| --- | --- | --- |
| Straight | Length 20, 40 or 60 m; width 8, 10 or 12 m | Two collinear ends with equal widths |
| Quarter bend | Radius 20 or 40 m; left/right; width 8, 10 or 12 m | 90° arc, tangent entry/exit; radius measures centerline |
| Hairpin | Radius 20 or 40 m; left/right; width 8, 10 or 12 m | 180° arc, tangent entry/exit |
| Width transition | Length 40 m; entry and exit independently 8, 10 or 12 m | Linear width interpolation, straight centerline |
| Start straight | Length 60 m; width 10 or 12 m | Ordinary straight geometry with suggested gate/grid region; exactly one per track |

Long straights are assembled from repeatable pieces. A chicane is a sequence of bends and straights. Curved pieces may not be scaled arbitrarily. Snap placement uses exact generated end transforms; a 20 m construction grid assists detached group placement without replacing connector alignment. Props use a 0.5 m optional grid and 15° rotation steps; inspector entry can use 0.1 m and 1° precision.

Each piece has a permanent UUID, an explicit next-piece ID and a rigid transform. The compiler verifies that the exit and successor entry meet within 0.02 m, heading within 0.1°, and width within 0.01 m. Saving canonicalizes snap transforms; it does not round an intentional gap into validity. The route is one directed closed cycle containing every road piece exactly once. There are no branches, disconnected loops, crossing roads or vertical overlaps in schema 1.

Adjacent corridors can share only their intended connector boundary. Nonadjacent drivable interiors must not overlap, and nonadjacent solid wall boundaries need at least 0.5 m clearance. Props may visually overhang only if their displayed solid collision footprint remains accurate. Decorative objects must stay outside the drivable corridor by at least 1 m unless explicitly non-solid low ground markings. Tall props are reviewed for camera occlusion.

Compile arcs adaptively to a maximum 0.05 m chord deviation, use analytic arcs for validation where practical, and cap the compiled route at 4,096 samples. Geometry that cannot meet both error and resource bounds is rejected with an actionable message. Physics broad-phase cells and rendered meshes derive from the same analytic descriptors, but independent geometry checks validate their agreement.

## Surfaces, props and bounded recipes

A surface patch belongs to exactly one road piece, spans a start/end distance along that piece and a lateral interval within its corridor. Asphalt is the default. Gravel and mud override it. Overlapping patches with different surfaces are rejected; adjacent equal-surface patches may be merged explicitly. Every wheel samples the final resolved surface. No global DOM query occurs per frame.

Tire barriers are line segments or bounded chains along the road edge. Scrap islands use convex footprints within the supported size range. Boost pads use rectangular triggers aligned with the road and must fit entirely inside it. An obstacle must leave a continuous drivable corridor at least 4 m wide, and at least one overtaking zone at least 10 m wide and 60 m long remains unobstructed.

Supported custom recipes combine one base object type with reviewed parameters: barrier damping, pad duration within 0.5–1.5 seconds, and decorative light preset. First-release official pad duration remains 1 second. Recipe variants create Workshop rules/content revisions; they cannot change official rules. Author-supplied JavaScript, shader code, remote URLs, arbitrary expressions and nested recipe execution are not accepted.

New executable behavior requires a reviewed registry entry, schema, icon/help description, interaction table, compiler support and tests. Merely naming a new type does not invent its implementation.

## Race setup and validation

The editor distinguishes **Valid document**, **Race-ready geometry**, and **Test lap completed**. Completing a lap demonstrates one successful route; it does not certify all cars, AI behavior or balance. A final publication requires all three statuses for the current gameplay revision, with a manual one-lap test. Any gameplay edit invalidates the test badge. Presentation-only edits retain it.

Validation runs cheap checks after each committed edit and full geometry checks after a short debounce. Test drive runs the full validator first. The Problems list includes severity, object name, explanation and Select object. Invalid drafts still save and export as clearly labeled draft files; importing them reopens an editor and cannot launch a race until corrected.

| Area | Required invariant | Example feedback |
| --- | --- | --- |
| Identity | Unique IDs, supported schema/type and immutable track ID | “Two road pieces share an ID. Import was stopped.” |
| Topology | One closed directed loop; all pieces reachable; connectors aligned | “Road piece 14 ends 1.2 m from piece 15.” |
| Geometry | Finite bounded transforms; no nonadjacent overlap; sample budget | “These two bends overlap at ground level.” |
| Width | Connector widths match; props preserve minimum passage | “This scrap island leaves 2.8 m. At least 4 m is required.” |
| Gates | Exactly one finish, 3–32 checkpoints in route order, 20–200 m gaps | “Add a checkpoint between Dock bend and Long straight.” |
| Gate coverage | Gate lies on and spans its corridor; direction agrees with route | “Finish gate faces against the racing direction.” |
| Spawns | Exactly six grid positions before finish; hull clearance; one safe respawn per gate | “Grid position 6 intersects the tire wall.” |
| Surfaces | Piece references resolve; spans fit; differing patches do not overlap | “Mud overlaps gravel on piece 8. Trim one patch.” |
| Objects | Allowed recipe and bounds; no executable markup | “This file contains an unsupported behavior type.” |
| Race | Lap count 1–9 for Workshop; official modes resolve their own fixed count | “Choose between 1 and 9 laps.” |
| Resources | At most 128 road pieces, 128 props, 64 patches, 32 checkpoints; 1 MiB UTF-8 definition | “Track has 131 road pieces; the limit is 128.” |

The overall centerline length is 200–4,000 m, within X/Z ±1,000 m. Grid and respawn clearance uses the largest supported car hull plus 0.5 m. A respawn faces forward, lies wholly in the road, has 8 m forward clearance and is far enough beyond its gate not to retrigger it. No gate may pass through a solid obstacle. Checkpoint distance is measured along the route, including the finish-to-first and last-to-finish intervals.

Deletion is explicit. Deleting a road piece detaches its neighbors and removes its owned surface patches only after a dependency summary; gates/spawns on it must be reassigned or deleted in the same undoable command. The resulting draft may be incomplete and is labeled accordingly. Deleting an in-use recipe is rejected until its objects are reassigned. Renaming never changes IDs. A duplicate operation regenerates every owned ID and reference together.

## Test drive

Test drive takes a frozen snapshot of the current valid draft and selected car. Solo test is default; a six-car exhibition toggle adds the same AI as the game. The toolbar offers Restart test, Return to editor and a compact optional diagnostic overlay. Return restores camera, zoom, selection, unsaved field context and undo history.

The first test warms the same car, surface and obstacle assets used in racing. A test does not publish, submit times or award League rewards. Its lap result can annotate the draft's test history. The test key includes gameplay revision, rules revision and build hash; changing a car invalidates only its car-specific test result, while changing track geometry invalidates all track test results.

Optional diagnostics display checkpoint order, road width, current surface and blocked AI points. They appear only when requested and are not part of the normal racing HUD. They use the runtime's real observations and do not claim a human review occurred.

## Drafts, imports and recovery

Each document edit increments a draft revision. Debounced saves commit complete validated structural snapshots to IndexedDB; an incomplete but parseable track can be stored as a draft. Show “Draft saved” only after transaction completion. Keep the last two committed snapshots and an explicit manual Download draft action. Storage failure preserves the in-memory work and offers download immediately.

Import reads at most 1 MiB into an inert parser, extracts allowed semantic fields and reconstructs canonical HTML. Reject scripts, executable attributes, privileged Pagelove policy blocks, include/method directives, remote resources, unknown semantic fields and unsupported future schemas. Rejection lists what was unsupported; nothing is silently dropped. Ordinary harmless formatting outside the semantic source may be discarded with an import report. A preview of the imported content precedes replacing a working draft, which remains recoverable.

Export contains the complete definition, supported preset references, schema version, gameplay revision and a human-readable title/description. It includes no credentials, personal device identifiers, pending scores or executable application code. A self-contained visual game is not implied: the receiving editor needs the compatible bundled runtime/presets.

Duplicate creates a new track identity. Import for editing an existing identity is a separate explicit flow that verifies the intended target. Undo, deletion and import preserve collision-safe object IDs. An incompatible older definition remains downloadable while a migration or new copy is offered.

## Publishing state machine

States are Draft, Checking source, Publishing, Confirming, Published, Conflict, Rejected and Offline. The screen always retains the last confirmed publication revision independently of the current draft revision.

1. Require a valid current gameplay revision and completed test lap. Pin the intended owner authoring host from configuration.
2. Read the current resource and ETag. Compare semantic content with the draft's recorded baseline. A newly fetched ETag must not silently replace a stale baseline and permit an overwrite.
3. If the resource is new, create with `If-None-Match: *`. Otherwise use the baseline-matching current ETag with `If-Match`.
4. Publish one complete track definition. It owns its pieces, surfaces, gates and spawns, so their integrity is checked as a unit.
5. Read back and compare canonical semantic content, including executable-reference exclusion. Show Published only after a matching readback.
6. If the network outcome is ambiguous, reconcile by target identity and semantic revision before retrying. A 412 retains the draft and offers compare, export and reload; never force-overwrite automatically.

The owner key stays in the active publish operation, is cleared from the form and is never stored, logged or exported. WebDAV intentionally bypasses platform schemas and triggers. Editor/build validation therefore protects this trusted-authoring workflow; it is not server enforcement against an owner writing other bytes. A future public publishing service requires a separately designed supported application boundary.

Publishing new content and adding it to a catalog are distinct writes. The catalog is an owner-managed discovery index, not the source of track validity. Publish the complete track first, then conditionally append its catalog reference. If the second write conflicts, the track remains accessible by its exact link and the interface offers Retry listing. Never roll back by deleting an independently modified track. Existing listed tracks can be edited in one resource write because their IDs and URLs remain stable.

Deleting a published track is outside the editor's first-release UI; archive it from discovery while retaining its exact revision references. This avoids dangling shared links and scores. Local draft deletion is confirmed and keeps a recoverable trash entry for seven days unless the user explicitly empties it.

## Acceptance journeys

The bundled editor is complete only after a keyboard user and a touch user can each create a closed circuit, correct an invalid connection, set gates, test a lap, return, undo an edit, recover after reload and export/import the result. The owner flow additionally needs a real conditional-write conflict, ambiguous-save reconciliation and readback on the selected Pagelove host. Official tracks must round-trip through the editor without changing gameplay meaning.
# Fixed-setup challenge workflow — October 28, 2026

Home → Crew challenges → Remix in Workshop opens a new editable identity. Edit and finish a valid ordinary test; Files → Set challenge target captures the actual time/build/laps/assistance and a public creator credit (1–40 printable characters). The target is optional semantic `TrackChallenge` data in the authoritative HTML document. It is never executable content.

Files → Race saved challenge validates the physical source/rules revision and uses the captured car and control setup. Invalid/stale targets cannot launch; ordinary tests and importing without the target remain available. Editing gameplay clears the target. Duplicate/remix creates new IDs and requires a new target run. Import validates an existing target, remaps all entity IDs for a safe separate local copy and rebinds only its physical-source identity; geometry, time, attribution and fixed setup are unchanged. Imported targets remain client-reported.

Export HTML distributes the circuit and target offline. The result screen also exports its captured circuit/challenge instead of sharing a link to an unpublished draft. The existing owner publication path publishes the complete semantic document and validates a present challenge before sending. Recipients of a published link can choose Race fixed challenge or edit a separate copy. Owner credentials are not stored. Ordinary public score submission is still limited to official Trial/Daily results.
