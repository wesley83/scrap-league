# Prism Breaker's document-first architecture

This implementation guide applies the [document-first rule](DOCUMENT-FIRST-DEVELOPMENT.md). Local implementation, host verification and deployment are separate milestones; see the [implementation audit](audit/2026-10-14-document-first-implementation.md) for current status.

## Sources and ownership

| Resource | Authority and lifecycle | Readers and derived representations |
| --- | --- | --- |
| public/world-catalog.html | Reviewed release source: permanent IDs/slugs, campaign order, legacy numeric mappings and physics ruleset name | Builders, public catalog, generated runtime list and route allowlist |
| public/worlds/{slug}/definition.html in Git | Reviewed official source: metadata, theme/music selections, formations | Official bundle, source document view, release review |
| /worlds/{slug}/definition.html on the host | Independently owner-managed Practice content; seeded once, preserved by releases | Native editor composition, Practice, published cache |
| public/world-schema.js | Shared executable schema/parser/serializer | Browser editor/import, build validation, generated server guard |
| public/bundled-worlds.js | Generated; never edited manually | Fast official gameplay and offline compatibility data |
| policy-candidates/world-policy.html | Generated candidate, not deployed | Local guard checks only; cannot enforce DAV authoring by platform design |
| /scores.html | Shared runtime records plus reviewed native schema, authorization, shape and triggers | Leaderboard, top-score display and offline board snapshot |
| Editor draft, saved adventure, score outbox | Explicit local working state | Recovery, resume and retry; never proof of a server write |

The two sets of world definitions have different roles. A shared Practice edit does not replace a ranked Adventure/Daily definition. Promoting a shared layout into an official release requires reviewing it into Git and rebuilding. Each representation has a traceable source.

## One world, several representations

1. The catalog identifies prism-garden independently of its display name.
2. Its HTML describes its name, instructions, completion story, palette, scene/music presets and formations.
3. Pagelove composes the editor shell and that world's #world fragment through /editor/:worldname.
4. The editor and game parse the same model. CSS styles editor bricks through semantic type selectors.
5. Practice validates the published document once and passes a compact model to physics and Three.js.
6. The official build validates checked-in documents and creates a complete runtime snapshot without needing an earlier bundle.
7. Each world gets a SHA-256 definition revision. The ruleset revision covers the declared physics version, ordered world IDs and gameplay formations. Presentation changes do not split rankings.

The catalog uses stable slugs as link labels, avoiding another copy of editable display names. levels.js exposes generated metadata; it is no longer a manually maintained world catalog.

## Identity and migration

Schema 2 contains immutable id and slug properties. Existing addresses are retained. Catalog order is separate; legacyIndex is only a migration mapping.

Formations are numbered within a world. A brick's identity is world ID, formation and brick ID. Its formation persists nextBrickId, so deleting the highest-numbered brick does not reuse that number during subsequent creation. Undo restores a prior document revision, including its identities.

The runtime adapter reads legacy world documents and drafts, verifies the old identity mapping, obtains missing metadata from the reviewed definition with the same slug, and upgrades the in-memory model. Publication writes schema 2. Unknown future schema versions are rejected.

A brick supports one custom recipe, combined with its base specialization and optional movement. Multiple custom tokens, duplicate properties and duplicate row IDs are rejected rather than silently reduced. Import reconstructs clean HTML; the inactive server guard candidate requires canonical output in local checks.

## Editing and recovery

Unknown routes present a chooser with editing disabled. They never select Prism Garden. A failed read presents Retry, an available saved draft and an explicit original-release choice.

A draft without a known published baseline cannot publish. Download it before reloading the published world. Importing or undoing into a reviewed baseline is an explicit action. Drafts with a baseline keep it for conflict comparison.

World details edit names, instructions, narrative, palettes and supported scene/music selections through the same undo/draft pipeline as bricks. The preview uses the real gameplay model. Preview music is not played; main Practice uses the selected music preset.

Publication snapshots the draft, reads the current document and ETag, compares canonical content, then sends a complete PUT with If-Match. A 412 is a conflict. Successful writes are read back. Ambiguous outcomes preserve the draft and require reconciliation. Editing during a save produces a message distinguishing the published snapshot from newer draft changes.

## Persistence boundary

World publishing remains owner-only. Credentials are sent only to the pinned authoring host, cleared from the field and excluded from drafts/exports. There is no new anonymous world-write grant.

The generated policy candidate is a separate document with exact catalog paths. In local checks, it accepts complete conditional PUTs using the shared schema and rejects partial writes, invalid geometry/references/types, executable markup and noncanonical documents. It is not deployed or active.

Live probes on October 14, 2026 found that DAV accepted invalid HP and missing-condition writes despite the trigger; stale ETags were rejected. A separate public GET trigger executed correctly, but public PUT with the owner key returned 401. Support confirmed on October 15, in correspondence relayed by Wesley, that WebDAV intentionally bypasses all schema validation and triggers and is only an authoring mechanism. These observations are expected behavior, not an enforcement bug or a failure of trigger discovery. Probe resources were removed. Shared-schema validation in the editor is useful feedback, but is not server enforcement against an arbitrary owner-authenticated client. Anonymous callers have no world-write grant.

The candidate uses [Pagelove triggers](https://docs.pagelove.com/reference/reacting-to-changes/Trigger/), but it cannot enforce owner DAV writes under the support-confirmed contract. Keep it inactive and excluded from normal deployment. Wesley chose owner DAV publishing only, and the activation operation now refuses unconditionally. Server-authoritative application writes are outside the selected trust boundary. A future change to that choice would require a separately designed authenticated flow; no expanded access or extra service is introduced here. See the [resolved report](DAV-TRIGGER-BUG-REPORT.md).

Scores retain native authorization, shapes, typed properties, request grammar, unique run keys and server-assigned expiry. The new optional ruleset property accepts old clients alongside new provenance. Revision labels are not anti-cheat proof.

## Checkpoints and rankings

Checkpoint version 2 stores stable world ID, definition revision, ruleset revision and the complete world definition. Restore uses its saved portals and metadata together with damaged bricks and remaining barriers.

The legacy ruleset fingerprint is frozen in world-identity.js. Version 1 saves and unversioned scores map to that known boundary. Future incompatible rulesets are rejected before changing the active game; legacy saves are not assumed compatible forever.

Incompatible adventures remain downloadable. Starting a replacement run attempts to retain a recovery copy. Storage may fail, so the explicit download provides user-controlled recovery.

Rankings include compatible rulesets only. Other versioned rows remain stored until ordinary five-day expiry. Daily scores retain their challenge day. Queued runs retain their original ruleset after an app update.

Change the catalog's physics ruleset name for future gameplay/scoring algorithm changes. Definition changes produce a new generated revision. Never rewrite the legacy fingerprint to make incompatible histories appear compatible.

## Behavior contract

BrickBehaviors.register(type, handlers) registers trusted application code. Documents select bounded recipes; they cannot import executable URLs or define scripts.

Handler order is urn:Brick, concrete specialization, movement when present, then the single custom type. Multiple registrations run in registration order. Unsubscribe removes only that registration.

| Event/hook | Meaning | Timing and cancellation |
| --- | --- | --- |
| strike | Request to apply a hit | Synchronous, before HP changes, cancelable; DOM event bubbles and propagates cancellation to the engine |
| onStrike(detail, event) | Trusted type handling | Return false or preventDefault to cancel; later handlers stop |
| brickdamage / DOM damage | HP changed | Completed fact, not cancelable; updates DOM remaining HP |
| brickbreak | HP reached zero | Completed destruction, before secondary break effects; forwarded to the DOM |
| onBreak(detail) | Consequences of destruction | Once per destruction; built-in handlers precede custom handlers and Practice recipes |
| brickbehaviorerror | Hook failed | Reports type/hook/brick/message; failed strike cancels damage; completed destruction is not rolled back |

These are synchronous local events, not durable messages or server permissions. Promise-returning hooks violate the contract. Further damage to a destroyed brick is ignored. Extensions starting asynchronous work must define their own persistence, retries and errors.

Example without a new engine branch:

    const detach = game.behaviors.register('urn:Brick:Moving', {
      onStrike({game}, event) {
        if (game.state === 'paused') event.preventDefault();
      }
    });
    // Later: detach();

Built-in switches and explosions use the same registry. Recipe effects cover bonus, pulse, open-gates, slow-ball, power-up and none. A new primitive requires reviewing its schema and implementation together.

## Offline operation and performance

Official play uses the versioned bundle. Mutable world reads bypass the worker's static cache. Practice tries the network, a separate published snapshot, an available draft, then the original release. Fallback messages identify the source. Published and draft cache keys are distinct.

Parsing occurs at load/import/build boundaries. Frame updates use arrays, Three.js objects and GPU resources. Limits are eight formations per world, eighty bricks and sixteen barriers per formation, zero or two portals, sixteen recipes and one million imported characters.

Procedural rendering, music synthesis, compact checkpoints, IndexedDB queues and standard PWA files are justified specialized representations. No external runtime service is introduced.

## Coverage of all 23 standards

| Rule | Application |
| --- | --- |
| 1. Domain first | Named worlds, formations, rows, bricks, recipes, scores and checkpoints |
| 2. Document resources | Catalog, definitions, score records and policies have lifecycle boundaries |
| 3. Structure | Typed HTML, native controls, readable definition headings/notes |
| 4. Authority | Source/derived ownership table and generated-code labeling |
| 5. Identity | Stable slugs, legacy mapping, brick counters, versioned checkpoints |
| 6. Native composition | Parameterized editor route and shared shell/world includes |
| 7. Provenance | Writes target the underlying world, never the composed shell |
| 8. Separation | Documents own data; CSS presents it; code computes and renders |
| 9. Events | Request/fact timing, order, cancellation and errors documented |
| 10. Extension | Bounded recipes and deterministic trusted registry |
| 11. Editors | Shared schema/model for editor, import/export, preview and gameplay |
| 12. Persistence | Score enforcement retained on its application path; trusted DAV authoring intentionally bypasses validation. Authoritative world mutation validation needs a separate supported application path |
| 13. Recovery | Drafts, undo/redo, ETags, readback and visible failure states |
| 14. Releases/content | Mutable worlds/scores excluded from normal release; ranked definitions versioned |
| 15. Accessibility | Labeled controls, keyboard editing, status announcements and failure states; no blanket WCAG certification claim |
| 16. Performance | Boundary parsing, bounded models and efficient simulation |
| 17. Offline | Published cache, draft, checkpoint, pending score and receipt distinguished |
| 18. Platform suitability | Native capabilities, verified limits and inactive guard candidate; no extra service |
| 19. Exceptions | GPU/audio/simulation/queues/credentials have justified representations |
| 20. Evidence | Regressions, cold build, browser review, audit and host release gate |
| 21. Explanation | Lifecycle, extension example, migrations and this matrix |
| 22. Qualified benefits | Mechanisms explained without automatic security/accessibility/performance claims |
| 23. Incremental adoption | Existing URLs, gameplay and compatible histories retained |

This is a maintained engineering checklist, not a certification. The distinct trusted-authoring and application-mutation contracts must remain explicit. Owner-only trusted authoring is the selected project contract; the prior application-write redesign is not a remaining promise. Intended DAV behavior is not a platform bug. Future changes need renewed evidence.

## Release procedure

1. Run bun run build, bun test ./tests and bun run check.
2. Review the diff, generated policy, audit patch and hashes.
3. Keep the historical candidate inactive; activation is disabled for the selected owner-DAV contract. Preserve existing native score policies. Follow the [immutable publication procedure](RELEASE-PUBLICATION.md) for package staging, conditional entries and rollback.
4. Migrate score rules conditionally while preserving every record.
5. Publish code/templates/PWA assets, preserving hosted world definitions and scores. Do not publish the inactive candidate as an enforced feature.
6. Read back the release and check native routes and Update game. Record the world-write enforcement gap explicitly. Local preview does not emulate Pagelove enforcement.

## Immutable runtime representation

The source documents remain authoritative. Immutable release directories are generated deployment representations, not new world-editing sources. Their package manifests, worker inventory and entry markers retain provenance. They include only cached assets and the schema-free editor template; root-only schema-bearing documents are not duplicated for native discovery. Separate conditional entries reference their own complete dependencies. See [publication](RELEASE-PUBLICATION.md), [remaining platform contracts](PLATFORM-REQUIREMENTS.md) and [implementation status](REMAINING-WORK-IMPLEMENTATION.md).
