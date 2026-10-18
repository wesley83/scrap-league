# Coverage review

Actor: Codex; UTC 2026-10-18T00:12:19.776Z. Status: completed for the adopted inventory, not product acceptance.

Candidate sl-b63afc9cbb2339; source 9e10a98cb441eb3e4153f4e85911bb5c407a2dff5c15c38c3ae4a6d593d93a59; output 8bcdf0696e1bfcfd57e5f824df7a11095e2059fc799ac147f796f3cb81372e0c; inventory d01e1dafd0d194be73bc803c6a2677fa030d5126a962760c5e8f43d86e5dae60.

Read the player/design/editor contracts and guide independently of test names. All 47 inventory IDs remain represented. The current 23-section map replaces stale historical numbering; new controls C11–C14 are adopted rather than silently omitted.

| Current guide section | Applicable contract and inventory IDs |
| --- | --- |
| 1 Scope/evidence | Existing physical/human exclusions; pinned guide, exact inventory and separate reviews; C09–C11 |
| 2 Player/delivery contract | Quick Race, League, Trial, Daily, practice and Workshop; J01–J10, M01–M04 |
| 3 Architecture/authority | Authored HTML, one editor DOM source, shared compiler, derived renderer and composed shell; M01, P04/P07/P09, C12 |
| 4 Editor/recovery | Validate/import/export, history, asynchronous save/navigation and first-entry reads; J08–J12, P01, M02 |
| 5 State/checkpoints | Captured cup/run state, atomic restore/results and input/clock ownership; J02–J04/J16, P01/P02, M04 |
| 6 Simulation/input/AI | Fixed step, legal AI controls, swept contacts, camera and cancellation; M01/M03, J02/J16 |
| 7 Feedback/progression | Practice, visible cues, garage tradeoffs and bounded progression; J01/J04/J05/J18 |
| 8 Scoring/effects/economy | Split arithmetic, cup rewards, boost/surface/reset interactions; J03–J07, P02, M01/M03 |
| 9 Shared results/calendar | Casual trust, original Daily identity, durable queue, leases and retention; J07/J15, P03/P05/P06/P08 |
| 10 Layout/controls | Available Chromium dimensions, keyboard/gamepad/touch contracts and complete journeys; J02/J08/J16, C09 |
| 11 Accessibility | Native UI, focus, measured contrast/reflow, enlarged text and motion; J02/J17/J18, C09. No full WCAG conformance claim. |
| 12 Scenes/audio | Four held scene families, mute/reduced motion and bounded signal checks; J18, M04 |
| 13 Performance | Actual renderer/buffer/quality, cold/long-run receipts and unchanged-dependency reuse; J16, M01/M04, C09 |
| 14 Assets/sharing | Independent branded asset contract, decoded images/icons, licenses and sharing fallbacks; C01–C03/C06, J17 |
| 15 Offline/updates | Complete verified pack, safe updates, old clients and offline journeys; J13/J14, M04, P09 |
| 16 Security/data | Inert bounded imports, trusted owner DAV, public shape/retention and private package exclusions; J10, P04–P06, C07 |
| 17 Release/maintenance | Strict gate on every publisher, pinned reviews, preservation, phase journal and operator recovery; C04/C05/C08/C10/C11/C13/C14, P09/M06 |
| 18 Genre | Arcade racing and asynchronous community competition apply. Platforming, puzzles, cards, dialogue branching, rhythm and real-time multiplayer modules are not adopted because those mechanics are absent. |
| 19 Pagelove adapter | HTML definitions, native composition, owner conditionals and separate public-rule probes; P04–P09/J11/J12/J15 |
| 20 Included model example | Illustrative reference, not game acceptance; actual model/storage scenarios use M01/P01/P02 |
| 21 Evidence templates | Qualified fixtures, selected interleavings, review/reuse and retrospective closure; C09–C14/J08/J09 |
| 22 Glossary | Terminology reference; no separate runtime feature |
| 23 Handbook maintenance | Guidance provenance for C11; handbook publication is not a game runtime obligation |

The available matrix is Windows/in-app Chromium with emulated layouts and injected device adapters, plus actual connector keyboard/pointer actions when explicitly recorded. It does not certify Edge on a physical phone or an unavailable engine. English UI is the adopted language; Unicode player aliases are supported. Synthetic inputs do not prove browser gesture arbitration or human enjoyment. Optional recorder/pathfinding/real-money/identity-account systems absent from this game are not new requirements.



Required gaps remain in the ledger: keyboard/touch creator coverage, browser-process crash/relaunch, original authoring provenance, provider behavior, exact hosted CI/current live publication, per-entry promotion rechecks, granular scenario receipts and phase/operator recovery. Optional absent genres, real-money/account systems and a gameplay recorder are not new features. No real-hardware, recruited-human or perceptual-listening requirements were restored.

The implementing agent performed coverage and evidence reviews; no additional agent or user approval loop is implied.
