# Runtime assets and licenses

All car geometry, track scenery, UI icons, maps, sounds and music in `app/` are procedurally authored for this game. The car, road and prop primitives are code assets, not copied third-party media. The number icon's editable source is `app/icon.svg`. No network fonts, media CDNs or model assets are requested at runtime.

Three.js 0.180.0 is MIT licensed. The exact upstream license is bundled at `dist/releases/<release>/vendor/THREE-LICENSE.txt`. linkedom 0.18.12 is MIT licensed and used only for build/test HTML parsing. Dependency identities and transitive versions are pinned in `bun.lock`.

Typography uses locally available Impact and Arial with system fallbacks; no font binaries are distributed. The offline manifest currently uses the authored SVG icon. Regular/maskable raster icons, social posters and a result-card image generator remain part of the full design's later asset work.
