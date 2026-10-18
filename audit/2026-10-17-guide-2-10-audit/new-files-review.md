# New-file review

The tracked change is retained in changes.patch; new test/helper source is retained in new-source-files.patch. New audit scripts, reports, raw observations, prior receipts and screenshots remain individually reviewable in this directory and audit/runs. The pinned guide is an exact copy of the identified canonical guide, not newly authored guidance. Historical and failed observations are retained and are not promoted to current passes.

All changed tracked files, new audit/test files and the ignored current immutable release are inventoried with SHA-256 and byte length in hashes.json. The manifest excludes itself. No private .local data or node_modules are included. Source/output identity and the limits of evidence reuse are separately checked in verification.json.

New test/helper source:

- tests/evidence.mjs
- tests/evidence.test.mjs
- tests/guide-release-controls.test.mjs
- tests/result-write-validation.test.mjs
- tests/startup-styles.test.mjs
