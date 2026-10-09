# Custom UI assets

## Documentation guides

Four original SVG illustrations in `docs/assets/` explain integration, native execution, authentication and response exports. They are authored diagrams with example routes, not captured product screens. Colors follow Relay's terminal palette. Every SVG includes accessible title/description text; commands remain copyable in Markdown. PNG exports provide portable embeds for GitHub and package documentation.

Run `python scripts/docs_assets.py` to regenerate the SVG masters from their editable source. PNG files are browser-rendered exports of those masters; refresh them when changing the drawings. No font installation is required.

- `fastapi-quickstart.svg`: install, mount, open.
- `fastapi-native.svg`: existing app, same port, real handlers.
- `endpoint-auth.svg`: shared token or endpoint override, then Authorize.
- `response-export.svg`: execute, inspect, choose Relay or JSON.

## Product identity

The favicon `apps/web/public/relay-mark.svg` and seven reusable SVG masters in `apps/web/public/brand/` come from `scripts/brand_assets.py`. The app colors the symbol and wordmark with its selected theme. See [brand usage](BRAND.md).

The wheel ships the same masters as the source tree. Package checks compare every SVG and favicon against its source. Asset URLs are served under `/relay/` and the favicon URL includes the package version so upgrades refresh it across devices.

JetBrains Mono is bundled via `@fontsource-variable/jetbrains-mono`; there is no font CDN or remote image dependency. Unused decorative artwork is excluded from source and packages.
