# Runtime assets and licenses

Car geometry, track scenery, UI icons, maps, sounds and music in `app/` are procedurally authored for this game. The car, road and prop primitives are code assets, not copied third-party media. The number icon's editable source is `app/icon.svg`. No network fonts, media CDNs or model assets are requested at runtime.

Three.js 0.180.0 is MIT licensed. The exact upstream license is bundled at `dist/releases/<release>/vendor/THREE-LICENSE.txt`. linkedom 0.18.12 is MIT licensed and used only for build/test HTML parsing. Dependency identities and transitive versions are pinned in `bun.lock`.

Typography is bundled locally: Bebas Neue Regular and Barlow Regular/SemiBold under the SIL Open Font License. Exact upstream URLs, byte hashes and retrieval times are in artwork/font-sources.json; the unmodified licenses ship beside the fonts. No font CDN is required.

The two branded promotional posters are app/social/og-landscape-v1.png (1726×911) and app/social/og-square-v1.png (1254×1254). They were generated with the built-in image generator for this game; their complete briefs are retained in artwork/. They are promotional illustrations, not screenshots. Public metadata uses the landscape image and its exact dimensions. Social posters are public release assets and intentionally excluded from the gameplay offline pack.

The favicon source is the authored app/icon.svg. tools/export-icons.mjs exports 16/32/48/180/192/512 PNGs, a 512 maskable icon with a centered safe-area mark, and a three-frame ICO. The editable maskable source is artwork/icon-maskable.svg. asset-contract.json independently declares required files and dimensions; tools/assets.mjs decodes them and verifies fonts/licenses/metadata.

Result cards are rendered at 1200×630 by app/sharing.js with exact result text and a QR code to the invitation URL. The local QR encoder is qrcode-generator 2.0.4 by Kazuhiko Arase (MIT); the source and license were reused unchanged from the previously bundled Prism Breaker vendor files and ship in app/vendor/.
