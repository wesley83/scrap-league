# PWA update verification

## SL-PWA-VERIFY-001 — 2026-10-16T18:28:10Z — Codex

Request: fully verify the stated PWA update behavior rather than infer success from source code.

Plan: run the existing worker regression tests; serve the previously deployed and current immutable releases on a fresh, isolated localhost origin; exercise real browser service-worker installation, automatic detection, manual activation, multiple-window veto, retained progress/drafts/settings, failed installation and offline reload. Use explicit local fixture controls and record browser-visible results. Independently compare public runtime/worker bytes with the tested release and check the public Settings path. No production mutation is needed for verification.

Affected files: this audit, verification fixtures and results beneath `audit/pwa-update-verification/`. Production application files and published releases remain the verification subjects.

Limits: available Chromium browser on Windows; no claim of Android Edge installation, OS notification delivery, or a terminated/restarted browser process. Synthetic local save records are labeled. Server 503 injection models unavailable network without changing the user's connection. Preserve failures and distinguish automatic checks from manual checks.

## SL-PWA-VERIFY-002 — 2026-10-16T18:39:00Z — Codex

Executed eight worker regression tests (all passed), six browser scenario groups (all passed), public byte/inventory readback and the live Settings offline-pack check. Added a seventh timing scenario, which reproduced a usability gap: the first manual check reports the active old pack as verified while the next release is downloading; Apply update requires a second check. Source inspection also establishes the absence of an explicit foreground-resume check or system notification implementation. See `pwa-update-verification/REPORT.md` for exact evidence, distinctions and limits. Production code and deployment were not changed.

Fixture corrections: retained the initial wrong-label timeout and the asynchronous draft-opening race as separate receipts; corrected both and reran on fresh origins. Retained initial public-byte mismatches and verified the expected provider HTML serialization hashes. Six successful scenarios used the actual published B root/worker/inventory. The slow-download scenario offered retained A as a valid next worker without applying it during the test.

## SL-PWA-VERIFY-003 — 2026-10-17T00:59:10Z — Codex

Request: "Commit, push, deploy."

Plan: commit and push the PWA verification evidence on the existing branch, then idempotently redeploy the unchanged `sl-644d25b8e44419` runtime to the authorized Pagelove host. Preserve the earlier acceptance/deployment receipts, add the new verification evidence and explicit notification limitations to J14, and bind fresh publication authorization to the unchanged candidate and current ledger. Review hashes and scan the new text for credentials before committing. After deployment, retain the new receipt separately without replacing evidence referenced by earlier acceptance records, verify public readback, and push the final publication record.

Scope: audit records only; the known manual-check timing bug and lack of explicit foreground-resume checking remain unresolved. No claim that this deployment fixes them. Existing product acceptance limitations and disabled public boards remain in force.

## SL-PWA-VERIFY-004 — 2026-10-17T01:02:49Z — Codex

Committed and pushed the reviewed verification records as `e9131e6` on `codex/release-remediation`. Idempotent deployment completed successfully for `sl-644d25b8e44419`: 109 public files verified, all 109 resources unchanged, zero resource rewrites. Owner credentials were passed only through hidden process input and cleared when the publisher exited.

Fresh independent HTTP readback passed: four favicon/social metadata assets, 27 native/fallback routes, PWA manifest/start/scope, current worker, disabled public boards and exact retained previous runtime. Receipts are `pwa-update-verification/redeployment.json` and `pwa-update-verification/redeployment-live-readback.json`; the executable readback method is retained alongside them. The earlier `audit/deployment.json` was restored byte-for-byte after retaining the new receipt so prior evidence references remain valid. Exact candidate publication verification still passes with the dated authorization. Production source/output hashes remain unchanged; the notification timing and foreground-resume gaps remain unresolved.
