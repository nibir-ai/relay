# Relay identity

Relay is a local API tester. Its mark combines a lowercase r with a baseline cursor, using the same squared lettering as the wordmark. It belongs beside the work: compact in the header, recognizable in a browser tab, and legible in one color. The browser title is simply Relay.

## Master assets

Original geometry lives in [brand_assets.py](../scripts/brand_assets.py). Run `python scripts/brand_assets.py` to rebuild all SVG masters and the favicon. The lettering is outlined; logos require no installed font.

- [Primary logo](../apps/web/public/brand/relay-logo.svg): blue mark, off-white wordmark, transparent background.
- [Light logo](../apps/web/public/brand/relay-logo-light.svg): darker blue mark and charcoal lettering.
- [Black](../apps/web/public/brand/relay-logo-black.svg) and [white](../apps/web/public/brand/relay-logo-white.svg): monochrome applications.
- [Symbol](../apps/web/public/brand/relay-symbol.svg) and [wordmark](../apps/web/public/brand/relay-wordmark.svg): independent white alpha masters for theme-aware application.
- [Icon](../apps/web/public/brand/relay-icon.svg): a transparent favicon with foreground/cursor colors that adapt to the browser's light or dark scheme.
- [Identity sheet](../apps/web/public/brand/identity.html): preview and SVG downloads, served at `/brand/identity.html`.

## Use

Keep the horizontal logo's proportions. Leave clear space of at least one upright's width around its visible silhouette. Use the symbol at 16px or larger; use the complete lockup at 128px or larger. At small sizes, use the mark alone. Avoid adding glow, gradients, outlines, animation or extra enclosing tiles to the header logo.

The app applies the selected theme's accent to the symbol and foreground to the wordmark using the SVG alpha masters. Everblush uses `#67b0e8`, `#dadada`, and `#10191d`; all other themes keep their existing palettes. Method colors remain functional signals. Body text stays self-hosted JetBrains Mono, with the readable rem scale documented in `apps/web/DESIGN.md`.

## Concept provenance

[Generated concept board](brand/relay-identity-concept.png) was made with the built-in image-generation tool. [Its exact prompt](brand/relay-identity-concept.prompt.txt) is retained and embedded in the image. It explores the identity; the SVG masters define the shipped geometry. The board is documentation artwork and is not rendered inside the API tester.
