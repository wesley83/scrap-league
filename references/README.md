# Design reference snapshots

These files are unchanged reference snapshots used to design Scrap League. They explain the source requirements when the package is opened outside the original workspace. Their historical relative links refer to the original Pagelove/Prism Breaker repositories; this directory is not a new maintained authority for those projects.

| Snapshot | Canonical source in the Pagelove workspace |
| --- | --- |
| DOCUMENT-FIRST-DEVELOPMENT.md | DOCUMENT-FIRST-DEVELOPMENT.md |
| GAME-DEVELOPMENT-BEST-PRACTICES.md | games/prism-breaker/GAME-DEVELOPMENT-BEST-PRACTICES.md |
| PRISM-BREAKER-ARCHITECTURE.md | games/prism-breaker/DOCUMENT-FIRST-ARCHITECTURE.md |
| PRISM-BREAKER-WORKSHOP.md | games/prism-breaker/WORLD-EDITOR.md |

The October 15 support clarification takes precedence over old statements that DAV might enforce triggers: it is trusted authoring and intentionally bypasses schema/trigger validation. The later standing interface preference removes Pause Animation/Resume Animation buttons from cinematics. The five-day access-driven cleanup and casual competition decisions belong to the documented prior game; this design explicitly selects the same initial product boundaries rather than claiming them as universal platform guarantees.

SHA-256 values in the package manifest identify the exact snapshots. New platform behavior still requires fresh evidence on the intended host during implementation. The source documents are reference material; only the Scrap League specifications define this game's proposed content, rules and acceptance scope.

`GAME-DEVELOPMENT-BEST-PRACTICES-2026-10-16.md` is a separate snapshot of the user's revised canonical handbook, including the retrospective augmentations and removal of required hardware/human sessions. SHA-256: `a36ca9adcf2fbca0178cc92bf11f43f647aaf36a5b819a42e5112b094518a2fb`. The earlier unversioned snapshot remains unchanged as design-time evidence. This dated copy makes the handbook work reviewable in the public game repository without committing unrelated changes from the parent Pagelove repository.
