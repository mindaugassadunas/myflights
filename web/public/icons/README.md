# Icon set

Replace the placeholders with real PNG icons before shipping:

- `icon-180.png` — Apple touch icon (180×180)
- `icon-192.png` — Android home screen (192×192, any + maskable)
- `icon-512.png` — Splash / install prompt (512×512, any + maskable)

Suggested workflow: design a single 1024px master in Figma (using `#0A0B0D` background and `#00D4FF` aircraft glyph), export at the three sizes via `oxipng`-compressed PNGs.

Until you replace these, the manifest will reference missing files — iOS will fall back to a screenshot of the page, which is fine for dev.
