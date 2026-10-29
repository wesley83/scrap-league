# Phone layout remediation plan

ID phone-layout-2026-10-18; actor Codex; user request: verify responsiveness, repair phone layout, commit, push and deploy. Recorded before implementation.

Reproduce the screenshot at 390/432 CSS pixels and test 320, 360, 390, 432, 480, 720, 721, 844, 1024 and 1440 widths in portrait/landscape. Retain the red baseline, then explicitly reset inherited mobile grid placement, allow intrinsic widths/text to yield, and verify every menu action is readable and reachable without horizontal clipping. Exercise start/race/pause/resume, event selection, Garage, Workshop, leaderboards and Settings; inspect portrait/landscape screenshots. Preserve native/physical checks exclusion.

The canonical guide is now edition 2.11.0. Compare its relevant Section 10/11 layout/evidence guidance with the pinned 2.10 adoption; retain the new guide snapshot/digest and apply the current adaptive-layout checks to this change. Do not silently relabel previous evidence or claim a full physical-device certification. Existing 47/102 outcomes remain required, with explicit impact-based reuse for unchanged systems. The former home-layout gap is corrected by new geometry/reachability checks, not by suppressing overflow or shrinking all controls.

Freeze source after the fix; build, run affected browser/worker checks and the complete automated suite, review candidate-specific acceptance, commit/push, inspect hosted CI, deploy through the existing conditional publisher and verify exact public root/native styles and the actual PWA update. Preserve older releases, public data and private ignored backups. Record hashes, diff and failed attempts; never record credentials.
