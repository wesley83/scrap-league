# PWA update verification — 16 October 2026

Verdict: the verified-download, safe-activation and save-preservation mechanisms worked in the available browser. The update notification flow has a reproduced timing gap, so the earlier one-pass Settings instructions were incomplete.

## Subjects and method

- Previous build A: `sl-eca6f97d1308a3`, root artifacts from Git commit `d25d58c` and retained immutable runtime files.
- Current published release B: `sl-644d25b8e44419`. Downloaded the actual public entry HTML, worker and release inventory. The public worker logic is identical to the local build; the expected HTML hashes reflect Pagelove's normal serialization. Current `main.js`, `offline.js`, `storage.js` and manifest are byte-identical to the local files.
- Browser: Chromium 155 on Windows, through Codex's in-app browser. A fresh localhost origin served the two releases, with real browser service workers, Cache Storage and IndexedDB.
- Two same-origin game iframe window clients exercised the ordinary application controls. The verification page acknowledged its own safe state; application clients used their unchanged production acknowledgement handlers.
- Progress/medals and settings were labeled synthetic fixtures. A named Workshop draft was created and saved through the application's controls. The upgrade comparison covered all seven persisted records, including the attempt history created when leaving the test race.

## Observed results

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh installation of A | Passed | Active worker and verified pack identify A. |
| Automatic discovery after a normal reload | Passed | Cached A loads, downloads B and displays `Update verified · apply from the yard` without a manual update check. No automatic modal appears. |
| Other window is racing | Passed | Discovery does not replace the racing document; its clock advances. Attempted activation is refused. Ordinary loss of focus can pause the race independently. |
| Later | Passed | Dismisses the prompt; A remains active. |
| Workshop open in another window | Passed | Activation is refused until that window returns to the yard. |
| Safe activation | Passed | Both game window clients reload into B after explicit Apply update. |
| Saved data | Passed | All seven sorted backup records are byte-equivalent immediately before and after activation; the named draft is visible after reopening Workshop. |
| Corrupt next download | Passed | An intentionally corrupt A asset causes installation failure; B remains active and verified, with no invalid waiting worker offered. |
| Offline reload after updating | Passed | With uncached server requests returning 503, a new document loads B and opens the saved draft. Progress and settings remain. Same browser process. |
| Public Settings check | Passed | The actual public game returns `Offline files checked and verified.` and remains on B. |
| Manual check discovers a slow download | **Gap reproduced** | The first click says `Offline files checked and verified.` while a valid next worker is still installing. After the delayed download finishes, Settings remains open without Apply update. A second Check offline pack click opens New release ready. |

Six grouped browser scenarios passed; the seventh reproduced the manual-check gap. For that seventh scenario, retained A was deliberately offered as the next valid worker after B, with its main.js response delayed three seconds. It was not explicitly activated during the test. This isolates lifecycle timing without publishing a new production version.

The eight existing worker regression tests also passed (`node --test tests/offline-worker.test.mjs`, 8 passed, 0 failed, approximately 1.50 seconds). They cover cache corruption and repair, failed installation/quota, stale/cancelled/expired acknowledgements, new windows during activation, duplicate activation, unsafe/unresponsive clients, retained-release rollback and cache retirement. These are simulated worker tests; they supplement the real-browser results rather than substitute for them.

## Corrections and remaining gaps

1. **Manual-check timing:** `registration.update()` can resolve while installation is still running. The manual path then verifies the active old pack and reports success. The installing worker's eventual state callback calls `checkOffline(false)`, which updates only the footer. The manual request should retain its intent through installation, show accurate download status and offer Apply update once verification completes in the yard.
2. **Returning from the background:** source inspection confirms that initialization and manual checking trigger checks; the visibility handler only pauses races. There is no explicit update check on foreground resume, reconnect or a periodic timer. Therefore bringing an already-open installed PWA back to the foreground is not guaranteed to perform a fresh application-triggered check. This is a source finding, not a physical-device observation.
3. **Notification visibility:** the ready notice is passive. There is no automatic update modal, Web Push subscription, push-event handler or system-notification implementation. No phone notification while closed is implemented.

The observed update mechanism does not establish Android Edge installed-app behavior, OS installation or cold browser-process restart. No hardware or human playtesting requirement is added. No production application code or deployment was changed for this verification.

## Evidence and reproduction

- `six-scenarios.json`: successful install/discovery/activation/preservation/failure/offline scenarios.
- `browser-results.json`: separately executed slow-download timing scenario and its gap.
- `public-readback.json`, `subjects.json`, `public-B/`: byte hashes and actual published entry/worker/inventory.
- `server.mjs`, `client.js`, `public-readback.mjs`: executable verification method.
- `verified-updated-draft.png`: updated B with its retained draft.
- `manual-second-check.png`: actual New release ready prompt after the second check in the timing scenario.
- `live-check.png`: public Settings check.

To reproduce, run `node audit/pwa-update-verification/public-readback.mjs`, then start `server.mjs` with an unused `PWA_VERIFY_PORT`. Open its `/__verify__/` page, run checks 1–6 in order, preserve their receipt, then run check 7. Browser interaction uses the visible fixture controls. Never use a player's production origin for synthetic data.

Earlier fixture failures are preserved in `first-fixture-failure.json` and `second-fixture-run.json`. The first expected `Saved` rather than the actual `Draft saved` label. The second entered a draft name before asynchronous Workshop opening finished; the current fixture waits for the loaded draft and verifies the named record in IndexedDB. That failure was not evidence of lost player data. Initial public byte comparisons are also retained; their differences were resolved by verifying the published HTML hashes instead of incorrectly requiring source HTML byte equality.
