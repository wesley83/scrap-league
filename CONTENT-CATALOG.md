# Scrap League initial content catalog

This catalog owns the initial content scope and tuning values. Distances, lap times and opponent speeds are authoring targets until complete track geometry and human playtests establish measured values. Names and IDs are stable even if display order changes.

## Circuit progression

All events use three laps. Length targets are 600–1,100 meters, with typical clean laps of 30–60 seconds. A track may vary within its range to satisfy geometry and pacing. The first and final thirds of a cup introduce and combine skills; its middle event gives room to practice. All circuits have at least one broad safe overtaking zone and a recoverable outside shoulder.

| Order and permanent ID | Name and cup | Layout and surface plan | Teaching purpose | Length and lap target | Identity |
| --- | --- | --- | --- | --- | --- |
| 1 `yard-loop` | Yard Loop · Yard Shift | Broad rounded rectangle; asphalt; one wide 180-degree end and two distinct straights | Brake before a bend, exit cleanly; no pads or mud | 600–700 m; 30–40 s | Morning light, orange crane, pale tire walls; sparse bass motif |
| 2 `tin-can-alley` | Tin Can Alley · Yard Shift | Offset loop with an S-shaped pair of bends; one 10-to-8 m taper; asphalt | Position before linked corners; avoid late steering | 650–750 m; 35–45 s | Stacked blue panels, flags and shallow puddle decoration |
| 3 `gravel-shift` | Gravel Shift · Yard Shift | Wide loop with a 90 m gravel arc and asphalt braking zone; 12 m width at transition | Feel mixed-surface grip; compare tires | 700–800 m; 38–48 s | Sunlit aggregate piles, tan dust and low timber barriers |
| 4 `dockside-dash` | Dockside Dash · Dock Circuit | Long main straight, paired 90-degree corners and a broad return; one boost pad | Use boost on exits and straights; choose engine tradeoff | 800–950 m; 38–48 s | Water beyond barriers, moored cargo silhouettes, cool steel palette |
| 5 `container-switchback` | Container Switchback · Dock Circuit | Two opposing hairpins linked by a 12 m passing straight; mostly asphalt, short gravel shoulder | Commit to a passing line and leave room on exit | 700–850 m; 40–50 s | Container stacks frame the course without hiding the apex |
| 6 `salt-flat-sprint` | Salt Flat Sprint · Dock Circuit | Flowing fast loop, long gravel section, two wide-radius bends; 10 m width | Sustained grip and early braking at higher speed | 950–1,100 m; 45–55 s | Open pale ground, distant shipyard gantries, strong dark road edging |
| 7 `furnace-bend` | Furnace Bend · Foundry Run | Slow hairpin followed by a technical asphalt S; no new hazard | Recovery event after fast cup; refine countersteering | 650–800 m; 38–48 s | Warm furnace glow behind opaque walls, cool road surface |
| 8 `mudworks` | Mudworks · Foundry Run | Two short mud patches on a wide straight and a gravel bend; clean outside passing route | Read surfaces and compare Rally tires; avoid stacking hazards | 800–900 m; 43–53 s | Reeds, drainage channels, amber work lamps; visible mud texture |
| 9 `crusher-circuit` | Crusher Circuit · Foundry Run | Static scrap islands narrow one straight into a marked chicane; broad runoff | Combine braking, surface choice and obstacle clearance | 850–1,000 m; 45–55 s | Idle crusher sculpture outside track, rhythmic warning lamps |
| 10 `night-sort` | Night Sort · Scrap League Final | Familiar corner forms in a new sequence; asphalt with one gravel exit | Transfer learning; lighting does not conceal the route | 800–950 m; 42–52 s | Floodlit sorting yard, cream edge paint, reflective numbers |
| 11 `redline-ridge` | Redline Ridge · Scrap League Final | Flat perimeter circuit beside a scenic embankment; fast straight into two slow turns | Balance top speed against controllable braking | 950–1,100 m; 45–60 s | Red retaining walls and long sunset shadows; no physical elevation |
| 12 `the-big-salvage` | The Big Salvage · Scrap League Final | Long flowing opening, gravel combination, one mud-choice section, final wide hairpin | Combine all skills, with a calm straight before the finish | 1,000–1,100 m; 50–60 s | Restored grandstand, cup flags and a handmade finish gantry |

### Authoring requirements for every circuit

- Use the geometry and validation rules in TRACK-WORKSHOP.md; author the official tracks in that workshop.
- Provide an ordered checkpoint before and after each section where a meaningful shortcut could bypass a corner. Gate spacing must satisfy the compiler limits.
- Use six collision-free grid spawns and a safe respawn at each checkpoint. Place the initial finish gate far enough ahead of the grid to avoid accidental first-frame crossing.
- Reserve at least 60 m of straight or broad-radius road for passing; a short technical section must lead to recovery space.
- Include a readable map, surface summary, one instruction, one garage tip and a six-car AI test record.
- Supply track name, description, music/scene preset, explicit lap count and stable identity as structured data. Derive track cards and route previews from it.
- Publish separate gameplay and presentation revisions. Lighting, copy or music changes alone must not split times.

## Vehicle assembly

Each build contains exactly one chassis, engine, tire set and utility kit. All values below are initial tuning. Total mass is the sum of these four choices. Every part uses a stable ID and schema version; a display-name change does not invalidate a build.

### Chassis

| ID | Name | Mass | Wheelbase | Body length × width | Maximum steering | Yaw response | Handling purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mule` | Mule | 760 kg | 2.45 m | 3.7 × 1.8 m | 30° | 6.0 /s | Predictable starter with a broad recovery window |
| `kite` | Kite | 640 kg | 2.20 m | 3.3 × 1.7 m | 33° | 7.5 /s | Light, quick to rotate, more sensitive to contact |
| `anvil` | Anvil | 920 kg | 2.70 m | 4.1 × 1.9 m | 28° | 5.0 /s | Stable at speed, slower to change direction |

Mass affects acceleration and collision impulses. Wheelbase and yaw response affect handling. Chassis weight is not also converted into a separate hidden speed penalty. Collision capsules derive from the visible body dimensions, with a documented shared geometric descriptor.

### Engines

| ID | Name | Mass | Launch force | Power | Governor | Tradeoff |
| --- | --- | --- | --- | --- | --- | --- |
| `courier` | Courier | 100 kg | 5,000 N | 85 kW | 38 m/s | Light and controllable; reaches its speed limit earlier |
| `torque-box` | Torque Box | 150 kg | 6,500 N | 100 kW | 40 m/s | Strong exits; extra mass lengthens braking distance |
| `longrunner` | Longrunner | 190 kg | 5,200 N | 135 kW | 46 m/s | Strong fast-straight performance; weaker slow-corner response per kg |

### Tires

The friction coefficient is used in the actual traction budget, not only a garage bar. Every set weighs 40 kg. Surface rolling-drag additions start at 0 N asphalt, 140 N gravel and 380 N mud before the wheel-contact weighting.

| ID | Name | Asphalt coefficient | Gravel coefficient | Mud coefficient | Purpose |
| --- | --- | --- | --- | --- | --- |
| `road` | Road | 1.10 | 0.72 | 0.48 | Strong paved-road cornering |
| `mixed` | Mixed | 1.00 | 0.88 | 0.66 | Predictable mixed-surface choice |
| `rally` | Rally | 0.92 | 1.02 | 0.82 | Better loose-surface control, reduced asphalt peak grip |

### Utility kits

| ID | Name | Mass | Exact starting effect | Tradeoff and interaction |
| --- | --- | --- | --- | --- |
| `roll-cage` | Roll Cage | 60 kg | Reduces collision-induced yaw impulse by 25% | Added mass; does not remove linear impact loss or alter collision shape |
| `flywheel` | Flywheel | 30 kg | Raises post-handbrake lateral recovery rate from 150 ms to 100 ms | Less contact stability than Roll Cage; no extra grip coefficient |
| `capacitor` | Capacitor | 70 kg | Capacity 120 and starting charge 80; drain and checkpoint award unchanged | Added mass; boost strength and legal checkpoint rules unchanged |

There are 3 × 3 × 3 × 3 = **81 builds**. Color, number and cosmetic decals do not affect that count or handling. Official daily loadouts always identify all four parts and their definition revisions.

## Collection progression

The starter is Mule + Courier + Road + Roll Cage. The eight other parts unlock once, on first completion of the numbered League event, at any difficulty. A replay cannot duplicate an unlock.

| Completed event | Reward | Reason |
| --- | --- | --- |
| 1 | Longrunner engine | Introduce the acceleration/top-speed tradeoff immediately |
| 2 | Mixed tires | Prepare for Gravel Shift |
| 3 | Kite chassis | First cup ends with a visibly different car |
| 4 | Capacitor utility | Make a longer boost reserve available after the pad lesson |
| 5 | Torque Box engine | Offer an alternative for tight exits |
| 6 | Rally tires | Prepare for the foundry's loose surfaces |
| 8 | Flywheel utility | Reward countersteering practice |
| 9 | Anvil chassis | Complete the collection before the final cup |

Events 7, 10, 11 and 12 award cosmetic paint/decal sets. Gold medals award a circuit stamp for the garage backdrop. A cup victory awards a hood badge. These cosmetics have no physics or board-key effect.

## Rival roster

Rivals are recognizable through name, car silhouette, number and behavior. These are behavioral tendencies, not dynamically granted advantages. The seeded cup roster selects five unique rivals; appearances and builds remain fixed through its three rounds.

| ID and name | Number | Build | Driving character |
| --- | --- | --- | --- |
| `bea` · Bea Bolts | 12 | Mule / Courier / Mixed / Roll Cage | Early braking, consistent clean exits |
| `otto` · Otto | 07 | Anvil / Torque Box / Road / Roll Cage | Defends a line, leaves less margin in contact |
| `kit` · Kit | 24 | Kite / Courier / Road / Flywheel | Late apex and quick direction changes |
| `mags` · Mags | 31 | Mule / Longrunner / Mixed / Capacitor | Saves boost for long straights |
| `riv` · Riv | 18 | Kite / Torque Box / Rally / Flywheel | Comfortable on gravel, conservative on fast asphalt |
| `sol` · Sol | 45 | Anvil / Longrunner / Road / Capacitor | High-speed specialist with a wide braking margin |
| `patch` · Patch | 63 | Mule / Torque Box / Rally / Roll Cage | Takes the safer loose-surface line |
| `pip` · Pip | 88 | Kite / Longrunner / Mixed / Flywheel | Aggressive passing attempts with seeded small errors |

## Daily selection

The daily schedule is a versioned document generated from the official catalog. For a UTC date, choose the track and build by a documented seeded PRNG using `daily-v1`, the date and the catalog gameplay revision. Store the resolved definition in the challenge record; do not rely on regenerating an old date from a future catalog. Use three laps, no opponents and the same standing start for all players.

The generator must avoid the same track on consecutive dates and include every track within each 12-day block. Shuffle the twelve IDs deterministically per block; use the previous block's last ID to repair a boundary duplicate by swapping the first two. Select one of the 81 builds with a separate deterministic stream. A catalog update starts a new schedule revision at a declared future UTC boundary. Existing dates within each revision retain their resolved data. The offline package includes 90 upcoming and 30 preceding dates; an older offline edition retains its own challenge identity and does not claim to be the current online edition.

## Content authoring brief

Each track's source document includes stable ID, route slug, name, short description, schema version, supported piece catalog revision, pieces, surface patches, props, checkpoints, grid spawns, respawns, laps, scene preset and music preset. Engine-generated meshes, AI route samples, minimaps and thumbnails are derived products.

The twelve official circuits are deliverables of implementation. They must be authored and exported through the bundled Workshop, then reviewed into the official release. This design's target lengths and descriptions are not falsely labeled as measured, finished track files.

Art assets include three chassis bodies, three engine silhouettes, three tire appearances, three visible utility kits, five road-piece families, three surfaces, three obstacle families, four environment kits, four cup badges, a simple car-number favicon, separate regular/maskable install icons, a 1200×630 social poster, a square alternative and a generated result-card template. Keep editable sources, licenses and build commands with each family.
