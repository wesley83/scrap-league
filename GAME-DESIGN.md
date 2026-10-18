# Scrap League game design

## Player promise

Build a car from mismatched salvage, race it around compact industrial circuits, and make a circuit of your own. The pleasure comes from learning a corner, feeling a different set of tires change the car, and immediately driving something you have built.

The intended audience is casual arcade-racing players and people who enjoy construction tools. A race takes approximately 90–180 seconds; a three-race cup takes 6–10 minutes including preparation. Editing can be a five-minute experiment or a longer creative session. First-time players should drive within 30 seconds of a completed initial load. These are design targets, subject to observation.

The arcade remake uses an overhead Canvas 2D camera, numbered cars and a planar racing model. Distinct road edges, chevrons, start markings and the next checkpoint make the route legible. The player has a yellow car and a YOU marker. Portrait view follows the car with road visible ahead; short landscape frames the forward direction along the wide axis. Reduced motion and north-up avoid camera rotation. The world is a handmade club circuit of stacked tires, painted metal and improvised stands.

## Core loops

**During a race:** Read the next corner, brake, turn, manage the slide, accelerate out, and choose a safe moment to pass or boost. Checkpoint markers and a compact route ribbon explain where to go.

**Between races:** See why the result happened, compare a part, test the change, and enter the next event. A heavier engine should visibly alter acceleration and corner entry; the garage gives contextual descriptions rather than an unexplained overall rating.

**During creation:** Place a road piece, see whether its connectors meet, add a surface or obstacle, test drive, then return to the exact editing view. Editing and testing use the same car and track model.

## Initial release contract

The complete first release includes twelve circuits across four cups, six-car races, three chassis, three engines, three tire sets, three utility kits, eight named rival profiles, four modes, a guided opening event, local progress, casual online times, offline play, sharing, and the bundled Track Workshop. A race selects five rivals from the eight profiles.

The driving plane stays flat. Road pieces support straights, quarter bends, hairpins and width transitions. Chicanes are assembled from these pieces. Bridges, jumps, intersecting routes, route branches, deformable terrain, weapons, player-to-player live racing and a public marketplace are expansion ideas rather than first-release dependencies. This preserves one clear geometry and checkpoint contract for driving and editing.

All numbers in this design are initial implementation values or measurable targets. They become balanced values only after the checks in [Acceptance](ACCEPTANCE.md).

## Modes

| Mode | Entry and goal | Completion and persistence | Comparisons |
| --- | --- | --- | --- |
| Quick Race | LET’S RACE starts Yard Loop immediately with the current car, five Relaxed rivals and two laps | Finish, save a local result and Race again; never changes League progress | No public board or unlock rewards |
| League | Begin or continue one of four three-race cups; select a build before each race | Every race result commits once. A cup checkpoint stores completed rounds and points. Finish all three rounds to receive its result | Cup standing against five fixed rivals at a chosen difficulty; campaign progress accepts every difficulty |
| Time Trial | Select an official circuit and any unlocked build; run a standing-start three-lap attempt | Finish, retry or leave. Only a completed, valid attempt becomes a best. Best ghost and result save together | Local best per exact track/rules/build/assist key; casual online board filters the same key |
| Daily Spec | One UTC-dated official circuit, three laps, fixed car and rules; unlimited attempts | Start captures challenge date, definition and loadout. Crossing midnight does not change the attempt | One comparable board per daily identity and assistance class; offer submission when the player improves their best. Aliases are not unique identities |
| Workshop | Create, import, duplicate, edit or open a published track; test with any part | Draft editing is available immediately. A test returns to the draft. A saved valid circuit can run a six-car exhibition | Workshop bests stay with the exact content/build/rules revision; no official unlock rewards or official board entries |

Workshop exposes every part for testing even before League unlocks it. This encourages creation without undermining the League collection. Time Trial and League use the player's unlocked collection; Daily Spec supplies its prescribed build.

The start screen leads with LET’S RACE. League, Daily Spec and Track Workshop are the next choices; Time Trial, Leaderboards, Garage and Driving school remain directly available. Settings and installation/update status are secondary navigation.

## First ten minutes

1. Start presents a circuit overview, a short invitation and a large LET’S RACE button. No account or alias is required to drive.
2. Optional Driving school is one solo Yard Loop lap. Its four prompts follow observed acceleration, steering, braking and accepted boost, with touch/remapped-key wording. Finishing alone does not claim every skill was demonstrated. Reset remains available through Pause or its keyboard binding.
3. The first real race starts with the Mule chassis, Courier engine, Road tires and Roll Cage. Club is the default difficulty; the entry screen also offers Relaxed and Expert.
4. The result shows finishing place, fastest valid lap, one specific observation and the next unlock. Examples: “Your cleanest lap was lap 2” and “Try braking before the tire-wall bend.” Advice uses recorded events, never an invented diagnosis.
5. After the first completed League event, Longrunner unlocks. The garage comparison explains its acceleration/top-speed tradeoff and offers Test drive on the same circuit.
6. Track Workshop is always visible. A separate three-step tutorial creates a bend, changes its surface and launches a test; it is not forced into the racing tutorial.

## Driving model

### Controls and response

Steering is relative to the car. W/up accelerates, S/down brakes and then reverses, A/D or left/right steer, Space applies the handbrake, Shift boosts, R requests reset and Escape pauses. Keyboard steering ramps to full over 120 ms and recenters over 90 ms. Steering remains responsive at low speed; reverse is capped at 8 m/s and its steering direction follows the normal vehicle convention.

Brake must reduce forward speed below 0.5 m/s before reverse engages after a 300 ms hold. Releasing and pressing brake while stationary can reverse immediately. This avoids accidental reverse during a tight turn. Opposed input cancels that axis. Gamepad uses left stick, right/left triggers, a face button for handbrake, another for boost, and Start for pause; labels reflect the active input method.

Touch defaults to auto-accelerate, a floating steering pad in a reserved lower-left control area, and brake, handbrake and boost on the right. Steering is a horizontal analog deflection; releasing it recenters. A two-button steering alternative is available. Auto-accelerate is also selectable for keyboard/gamepad and is part of the assistance key. Tilt steering is not required.

### Simulation starting values

The simulation runs at 120 fixed steps per second and renders independently with interpolation. World distance is in meters, mass in kilograms and time in seconds. The chassis supplies wheelbase, steering response and body geometry; the engine supplies force, power and speed governor; tires supply surface grip; the utility kit supplies its named bounded behavior. The complete part tables are in [Content catalog](CONTENT-CATALOG.md).

Initial longitudinal drive force is `min(launchForce, powerWatts / max(abs(forwardSpeed), 5))`, bounded by available tire traction. Acceleration follows force divided by assembled mass. Brake force initially corresponds to 9 m/s² before grip limits. Aerodynamic drag is `0.6 × speed²` newtons; rolling resistance begins at `0.015 × mass × 9.81`, with additional surface drag. Governors smoothly taper drive force over the final 2 m/s rather than cutting velocity.

The handling model uses a bicycle steering target with smoothed yaw response and bounded lateral grip. Tire friction limits combined longitudinal and lateral acceleration, with a friction-circle budget. Handbrake reduces lateral stabilization to 45% and drive force to 25%; it does not award points. Chassis-specific response and handbrake behavior must be tuned with independent skidpad, slalom and braking fixtures. Visual wheel steer, body roll and smoke follow the simulated state.

Never set position directly to an AI path or change grip based on player position. A sliding car can recover through countersteering and reduced throttle. Grip returns progressively after leaving mud or releasing handbrake, over 150 ms, to avoid a discontinuous snap.

### Collisions and recovery

Car contact uses oriented capsules based on visible solid bodies; wheels and cosmetic trim do not extend the collision hull. Walls use the same generated boundaries that render their solid faces. Use swept continuous collision checks, resolve the earliest contact and consume remaining step time with a bounded solver. Initial overlap recovery moves the minimum valid distance without awarding progress.

Wall contact loses speed along its normal while retaining tangential motion. Car contact is a damped impulse, with no deliberate damage knockout. Utility kits change bounded recovery or contact behavior. Cars do not shed functional parts during a race, and there is no repair bill.

Reset places the car at the latest passed safe checkpoint spawn, pointing forward with zero velocity. The car waits two seconds while the race clock and opponents continue. It becomes non-colliding with other cars for one additional second, with a striped silhouette; walls and surfaces still apply. Reset never advances checkpoint or lap progress. The same rule applies to AI recovery.

After four seconds with less than two meters of route progress while attempting to drive, show “Stuck? Reset car.” An automated reset occurs only if the car is outside the world boundary or has a non-recoverable invalid state. Reset remains available from pause and touch controls.

### Boost and track effects

Every car starts with 60 charge, has a capacity of 100, consumes 30 charge per active second, and gains 10 at each newly accepted checkpoint, including the finish crossing that starts another lap. Repeated crossings and reverse crossings give nothing. Holding boost gives 1.35 times drive force and a 1.15 times governor while forward speed is above 3 m/s and the handbrake is released. Charge is consumed only when the effect applies.

| Effect | Trigger and duration | Overlap and reset behavior |
| --- | --- | --- |
| Driver boost | Held valid input with charge; bounded by remaining charge | Does not stack with pads; higher force multiplier wins. Pausing freezes consumption. Reset clears active effect but preserves remaining charge |
| Boost pad | Forward entry into an authored pad; 1 second | 1.25 drive multiplier, normal governor. A new pad refreshes to 1 second; the same pad needs exit and 1 second before retriggering. Driver boost takes precedence |
| Mud | Physical tire contact with the surface patch | Continuous grip/drag values; no timed stacking. Four tire samples determine weighted contact |
| Loose gravel | Physical tire contact | Uses the tire-specific grip and surface drag. Dust is presentation only |
| Tire barrier | Solid contact | Damped collision, reusable; never a source of points or charge |

No randomly appearing power-ups are needed for launch. Effect ordering is specified in ARCHITECTURE.md, including simultaneous checkpoint, boost and finish events.

## Race rules

A race has six grid positions, a three-second countdown and one closed route. Grid starts are staggered with at least a car length of clearance; the player starts fourth in League round one. Later rounds reverse the prior classification. Time Trial and Daily are solo standing starts.

The clock starts on Go and advances with simulation time while Racing. Pause, menus, countdown and result scenes do not count. Reset delay and handbrake time count. Finish time records the interpolated fraction of the simulation step at the legal final crossing, rounded once to milliseconds for storage/display. Lap one includes the standing-start approach to the line. Round split displays to milliseconds and assign any rounding remainder to the final split so their stored sum equals the total.

The track has one directed finish gate and an ordered set of checkpoints. A gate is accepted only on a forward crossing of its finite segment after the preceding gate, with the car center moving through the permitted drivable corridor. The finish is initially unarmed until all ordinary checkpoints have been crossed. Shortcutting never makes a gate count out of order. Missing a checkpoint shows its position and direction; it does not silently award a large arbitrary penalty.

The car's progress is completed laps, accepted checkpoint sequence, and projected progress within the current corridor. The projection is limited to the reachable route interval; a nearby parallel straight must not jump the car ahead. Wrong-way feedback starts after one second of sustained motion against the expected interval and clears after forward progress resumes.

When the player finishes, its place among already-finished cars is final. Remaining AI cars are classified by their route progress at that instant; unfinished times display “Behind” rather than fabricated finish times. Exactly simultaneous finish crossings use raw crossing time first and initial grid slot as the final deterministic tie break. Cup points are 10, 7, 5, 3, 2 and 1. A player DNF receives zero and is recorded only in attempt history; the cup checkpoint remains before that round until the player finishes it. Abandon confirmation explains this consequence. Retry restarts the same uncompleted round without granting or removing completed-round points.

An eight-minute race limit prevents indefinite sessions. At the limit, every unfinished car is a DNF, ordered by progress; all DNFs receive zero points in that attempt's result. A player timeout leaves the cup round uncompleted and offers Retry or a lower difficulty; changing difficulty starts a new cup record and preserves collection/unlocks. A cup tie resolves by wins, then second places, then third places, then better final-round classification, then fixed competitor ID. Player-visible copy says “Tied on points” when a tiebreak is used.

## Campaign and rewards

The four cups are Yard Shift, Dock Circuit, Foundry Run and Scrap League Final. Each contains three races. Completing an event, at any place or difficulty, unlocks the next event. Completing the third round opens the next cup. The player can replay any opened event without overwriting the current cup checkpoint; a separate “Restart cup” action replaces that checkpoint after confirmation.

The eight additional parts unlock on first completion milestones, as defined in the catalog. There is no consumable currency or paid repair loop in the first release. All part choices are sidegrades. Cosmetics and cup badges reward improvement without increasing handling stats.

Each event grants one best-ever medal per difficulty: Bronze for finishing, Silver for a podium, Gold for winning. The cup earns the same medal from overall standing. Higher results replace lower medals without double-awarding unlocks. Relaxed results advance the campaign normally and remain labeled Relaxed in event history.

Campaign completion is finishing all twelve events. It restores the final circuit in a short scene and presents the assembled car, four cup badges and an invitation to create a track. The scene holds its final readable frame until Continue. Replaying the final does not erase progress or rerun unlock transactions.

## Rivals and difficulty

AI uses the compiled route corridor, upcoming curvature, tire grip and obstacle clearance to choose target speed and steering. It drives through the same acceleration, grip, collision, boost and checkpoint code as the player. Difficulty changes lookahead accuracy, target speed, reaction delay and deterministic mistakes; it never teleports a trailing rival or silently increases engine power.

Relaxed targets 72–82% of the tested clean-line speed with a 280 ms reaction window. Club targets 84–94% with 160 ms; Expert targets 95–102% with 90 ms. These are initial tuning ranges, not measured player difficulty. Rival personality varies passing gap, brake margin and willingness to use boost, within that difficulty envelope. The seed and fixed rival selection stay with the cup checkpoint.

AI recovery uses the same two-second reset. An obstacle can invalidate its preferred line, so every authored track must pass multi-car navigation tests and real racing observation. A solitary perfect-line bot does not establish overtaking or enjoyable opponents.

## Garage

The car occupies most of the screen. Four labeled slots surround or sit beside it: Chassis, Engine, Tires and Utility. Selecting a part updates the visible assembly, mass, estimated acceleration, governed speed and surface grip comparison. Estimates are derived from a reproducible bench simulation of the actual handling model and labeled as estimates.

Show the current and candidate part together, with one practical description: “Quicker out of slow bends; reaches its limit sooner.” Avoid a single “better” score. Lock text names the exact first-completion milestone. A player can inspect and preview locked parts and use them in Workshop, but equipping for League/Time Trial requires unlocking.

Save build creates a named local preset, up to 12 presets. Duplicate produces a new ID. Names are plain text up to 32 Unicode characters. Changing a preset does not change a build already snapshotted into a race or result. Restore starter build is undoable within the garage session.

## Interface and visual direction

Use warm, overcast daylight and controlled pools of amber light. Track boundaries are readable at speed. The car paint is a strong identifying color with a number and roof symbol; opponents differ by both color and shape. Distant props stay lower contrast than road edges and cars. Camera tilt starts at 55 degrees from the ground, with a heading-aligned view and 250 ms lookahead smoothing; an optional fixed north-up camera avoids rotation.

The interface uses near-black charcoal (#202421), warm off-white (#F2EBDD), pale secondary text (#CBC8BC), neutral borders (#565B53), and restrained signal yellow (#F2C94C) for primary racing actions. Error and success states always include text or a symbol. These are proposed art tokens, subject to contrast checks. Use a bundled condensed display face for titles and a bundled readable sans serif for body/UI, with tabular timing digits and system fallbacks. License files accompany fonts.

No decorative northeast arrows or colored accent side rails. Use labeled neutral controls, clear selection state and scene previews. Keep the Pagelove attribution text-only and link to https://pagelove.com with an accessible external-tab indication.

| Screen | Primary information and action | Secondary details |
| --- | --- | --- |
| Start | Car, Continue league or Race, Daily Spec, Track Workshop | Current cup progress, Garage, Settings, update availability |
| Event entry | Circuit map, three laps, surface mix, chosen build, Start race | Difficulty, rival lineup, medals, handling tip |
| Race | Place, lap, timer, next checkpoint, boost charge | Minimap, best-lap delta in solo modes, pause |
| Pause | Resume; the run is visibly frozen | Settings, Reset car, Restart race, Back to start screen with consequence copy |
| Result | Finishing place or valid time, medal, next action | Lap splits, build, ghost toggle, share, confirmed/pending community-board state |
| Garage | Assembled car and four parts | Bench comparisons, presets, Test drive |
| Workshop | Track canvas, active tool, selected-piece inspector, Test drive | Validation list, draft state, undo/redo, import/export/publish |

On desktop the HUD uses a compact upper strip, with no permanent leaderboard covering the road. Touch controls occupy reserved bottom corners and the camera frames the next corner above them. Portrait uses a taller road view and two compact HUD rows. Landscape phones shrink ornamental framing before controls. Menus may scroll; primary dialog actions remain reachable at 320 CSS px and large text.

## Shared casual times

Completed official Trial and Daily runs can be submitted from the result screen to separate public Pagelove documents. Each standing compares only runs with the same captured track, track revision, physics revision, car build, assist settings, lap count and challenge identity. A Daily run retains the edition captured at race start across UTC midnight. Cup, Workshop and unfinished or degraded runs are not submitted.

Players may choose a public alias. The server validates the record shape and assigns receipt/expiry metadata; duplicate IDs are rejected. Rows remain rankable for five days after receipt, are removed by later online board reads, and stay cached locally for offline viewing. The retry outbox reuses the same run identity after ambiguous responses. Local personal bests and ghosts remain independent of public submission.

These are community-reported times, not verified competition. A modified client can submit a fabricated time or alias. Public endpoints accept only the two run-record collections and expire rows; they do not grant access to game progress, Workshop documents or other site resources.

## Audio and motion

Sound should make handling understandable: engine pitch follows RPM/load, tire squeal follows lateral slip, gravel has a distinct contact texture, and impacts vary with impulse. Engine loops must not restart every frame. Use bounded, pooled voices and separate music/effects gains. Pause and hidden states suspend generation, not merely set its gain to zero.

Each cup has a musical motif: light percussion and plucked bass in the yard, syncopated metal percussion at the docks, slower heavy drums in the foundry, and a combined final arrangement. The countdown, checkpoint, boost-ready and finish cues remain identifiable at low volume. Music is supportive rather than required to understand a race. Track ambience and music presets are selected from bundled reviewed assets or procedural presets, with provenance.

Cup openings last approximately 4–6 seconds, are skippable immediately, reveal captions at once and end on a readable held frame. Results use a brief car roll-in and then hold. Reduced motion removes camera orbit, shake, speed streaks and celebration travel; reduced effects lowers particles/shadows without changing rules. No Pause Animation or Resume Animation buttons are added to cinematics, following the later standing preference.

## Accessibility and device behavior

Menus, garage, track list, editor inspector, validation, help and results use semantic HTML with keyboard navigation and visible focus. The editor has a numeric/list-based alternative to pointer placement. Gameplay instructions and warnings have visual equivalents for audio. Color never identifies route direction, a selected object or a rival by itself.

Settings include music/effects levels, reduced motion, effects quality, camera mode, auto-accelerate, steering sensitivity, touch layout, readable large HUD and control remapping. Steering assist, if enabled, adds at most 0.15 to the normalized steering input toward the reachable route tangent, only above 3 m/s forward speed and with handbrake released; the final input stays within [-1, 1]. It is included in the assistance key and never passes checkpoints or brakes automatically. Launch defaults leave steering assist off. Accessibility settings affecting only appearance or audio do not split comparisons.

Pause clears all held input. Returning from settings restores the pause dialog; Resume restores the driving input context. Name-entry fields never trigger driving shortcuts. Blur, hidden-page transitions, gamepad disconnect, lost pointer capture during steering, rotation that materially changes the viewport, and graphics-context loss pause the race. Resume is explicit, with a short ready indicator and no added race time.

The action game is visually driven; this design does not claim nonvisual racing equivalence. Keyboard, accessibility-tree, enlarged-text and emulated-touch checks cover surrounding workflows and editor controls. Physical-device, human playtesting, perceptual listening and physical assistive-technology sessions are not required release checks, per the user’s October 16, 2026 scope change.

## Saves, offline play and sharing

Preferences, progression, cup checkpoint, garage presets, personal bests, ghosts, workshop drafts and pending online results have separate stores and reset actions. Commit results, rewards and progression atomically by run ID. Repeated result entry or a recovered crash cannot grant a second reward.

Within one open session, pause resumes the exact in-memory race. After a reload or process termination, the cup resumes at the start of its uncompleted race, with its captured track, build and seed; completed rounds stay committed. Time Trial and Daily resume at their entry screen with the unfinished attempt discarded. This behavior is explained before leaving a live race. A Workshop test returns to its saved draft. Mid-race exact replay saves are not required for launch.

After a complete verified download, official racing, the garage, editor tools, imported tracks and previews work offline. An uncached published track needs a connection; it never silently substitutes a different track. Publication and board submission report pending or unavailable states accurately. Local bests remain useful when a board fails.

Results offer Share result, Copy invitation and Download scorecard according to actual capability. The message includes Scrap League, circuit, mode, time/place, and one canonical link. A daily invitation states its UTC date and whether it opens that historical challenge. Share cards show confirmed rank only when a fresh compatible board confirms it. Canceling a share leaves the result intact.

Track sharing distinguishes a published link from a downloadable HTML definition. The initial owner publishing model allows everyone to create, test and export drafts; only an authorized owner publishes to the shared host. There is no public track-upload account system hidden behind the Share button.

## Definition of the first complete experience

A player can finish all four cups, understand and change a car build, retry a time trial, play the correct daily challenge, create a valid circuit from scratch, race it against five AI cars, recover the draft after interruption, export/import it without changing its meaning, and publish through the authorized owner flow. The same player can install/download the game, relaunch offline, and later apply an update without losing progress or creations. Each promise requires the evidence in ACCEPTANCE.md.
