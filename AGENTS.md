# Scrap League contributor instructions

Record plans before implementation and meaningful change batches in `audit/`. Include an identifier, UTC timestamp, actor, user request or plan reference, changes, reasons, affected files and verification results or explicit limits. Preserve earlier entries; correct them by appending. Save hashes and reviewable change evidence before committing. Never record secrets or private payloads.

The HTML in `content/` is authoritative. A normal build validates and derives runtime assets; it must not rerun the destructive content-authoring utilities. Use the pinned lockfile. Preserve older hosted release folders needed by installed clients. Keep credentials and remote backups outside Git, including ignored `.local/`.

The game and editor share their model/compiler. Do not claim production acceptance beyond evidence in `IMPLEMENTATION-STATUS.md`. WebDAV is trusted owner authoring and intentionally bypasses platform schemas/triggers; separate application mutations need their own supported validation path.

Use `https://pagelove.com` for Pagelove links. Do not add decorative northeast/up-right arrows or colored accent side rails/borders on interface cards.
