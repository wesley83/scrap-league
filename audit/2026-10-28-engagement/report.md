# Six engagement improvements — local verification report

Actor: Codex. Completed October 28, 2026 UTC. Request: “Do all 6”, referring to the six researched engagement recommendations. Planning and intermediate failures are retained in plan.md, batch-1.md and batch-2.md.

## Delivered player outcomes

| ID | Local implementation | Evidence |
| --- | --- | --- |
| E1 | Bronze/Silver/Gold crew challenges on three circuits, nine recorded ghosts with fixed setup, persistent compatible best across tiers, next-target gap and recorded sector/contact/stationary coaching | Nine reproducible ordinary-control recordings; browser target finish at 94.531s showed Silver beaten and 0.017s to Gold, then both lower tiers remained marked beaten |
| E2 | Controlled forward bend exits earn at most six boost, within capacity, once per bend/lap; ordered route progress, clean traversal, exit speed/alignment and no reset/contact/handbrake required | Reward/cap/farming/reverse/off-road/skipped-gate/reset/slide/slow-exit assertions; ordinary controller journeys; named HUD feedback |
| E3 | Yard Loop, Dockside Dash and Furnace Bend gain partial inside gravel, a narrow exit pad and named paired-light landmarks, with pre-race route advice | All three authoritative documents compile; 12 line/build comparison runs finished without incidents/resets; tested inside routes saved about 0.22–0.36s/lap with greater gravel exposure and an additional pad activation |
| E4 | Grip Specialist, Straight-Line Rocket and Stable All-Rounder presets, explicit tradeoffs, preserved unlock rules, measured same-controller 20-second comparison and existing ordinary test drive | Repeatable simulation measurements differed across builds; browser preview of locked Grip Specialist could not equip it for League |
| E5 | Bea brakes earlier, Kit commits inside near bends, Mags saves boost for a passing opportunity; bounded deterministic normal controls, actual-roster rivalry objective and classification-based result | Input/reaction/physics assertions, existing multi-track campaigns, and browser six-car finish showing the Bea objective complete |
| E6 | Featured circuit → remix/edit → valid test → credited fixed target → race/export/import/owner-publish workflow, with source/rules/build revision checks and edit invalidation | Browser chooser export/import, fixed setup overriding conflicting preferences, valid target finish, target removal after a lap-count edit; database reopen and controlled owner transport/readback assertions |

The new driving revision is `scrap-physics-v1.2.0`. Old results/ghosts cannot enter new comparison buckets. Optional challenge metadata belongs to the semantic HTML source, with its comparison identity separate from physical geometry. Import validates a target and rebinds its physical identity to a new local copy; remix clears it for a new creator run. Unpublished results export their captured HTML rather than linking to an unpublished slug.

## Verification

- **128 tests passed, zero failures and zero skips.** Includes nine new engagement tests, 36 six-car race checks and persisted continuous twelve-event campaign checks. Initial 124/125 run and its corrected recipe-fixture assumption are retained.
- Home controls checked at **320×568, 390×844, 432×900, 568×320, 844×390 and 1280×800**, including the actual 32px provider-footer reservation selector. No horizontal clipping and all inspected home controls at least 44px.
- Doubled current computed text sizes on the phone home and challenge dialog: no inspected text/control overflow. These are fixture font substitutions, not OS zoom/hardware evidence.
- At **844×390**, visible touch controls and Pause remained at least 44px, their centers hit the intended elements, and they stayed above the reserved footer. Pause/resume, settings and a complete rival race were observed.
- Workshop workflow used actual visible controls and the browser file chooser. Accelerated completion used ordinary validated simulation inputs through the actual terminal state with a finite tick budget; it elided countdown, never injected position, gates, lap completion or result payloads. Its reports are distinguished from ordinary input and from unmodified screenshots.
- A fresh unmodified document at the shared Dockside/Silver URL opened only that circuit and focused the invited target. The clean preview also observed its local offline pack verified.
- Build, candidate artifact/source integrity and `git diff --check` passed. Final cleanup removed trailing blank lines in three Markdown files after the full suite; rebuilt application release bytes remained identical. No code changed after that suite.

## Candidate and evidence

- Release: `sl-c84ff03afc7e71`
- Source SHA-256: `ff17dbed48376215203d4a6b56a2672c4f6bbe406547421cc8a1da777df45810`
- Output SHA-256: `0d8db25f539f9b68ad5207f1107f2318830ebf6cf8a1e502b813ad9f1def01a1`
- [Machine-readable verification](verification.json) binds E1–E6 and all 16 named local scenarios to hashed evidence. [Coverage review](coverage-review.md), [evidence review](evidence-review.md), source-manifest.json and reviewable-tracked-changes.patch preserve the review.
- Current guide supplement: handbook **2.13.0**, pinned in guide-2.13.md and requirements.json. The prior adopted obligations remain in the 54-row inventory; this scoped result does not declare the whole hosted release accepted.
- [Unmodified phone screenshot](crew-challenges-phone.png), [unmodified desktop screenshot](crew-challenges-desktop.png), browser receipts, full test logs, exported challenge HTML and geometry JSON are retained alongside the report. The first new preview tab used its default desktop dimensions; that capture is correctly named desktop. Phone capture dimensions were subsequently explicitly set and observed as 390×844.

## Delivery state and limits

**Implemented, built and locally verified. Not committed, pushed or deployed.** The local preview is running at http://127.0.0.1:4443/. The isolated review server was stopped and owned test tabs were closed; a clean preview tab remains open. Existing user tabs were preserved.

This turn did not mutate production boards, tracks, policies or existing player records. A later hosted release must renew impacted exact-candidate acceptance and preserve existing records when migrating the official board identity policies for the new physics and three track revisions. The previous full-release ledger is historical and cannot authorize the changed source.

No physical-device, native-desktop, recruited-player or perceptual-listening checks were required or claimed, consistent with the user's earlier decisions. Tests and explicit LLM review support the listed mechanical and layout outcomes; they do not establish subjective enjoyment, retention or every unobserved phone/browser combination. Owner publishing was exercised with controlled transport, not a new public publication. Original and new authoring provenance remains recorded: the three targeted semantic HTML edits used the one-time author-lines.mjs operation; normal builds never rerun it.
