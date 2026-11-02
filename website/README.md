# Relay documentation website

Public documentation: https://relay-backend.pages.dev/

The static website combines focused API testing articles in `website/content`
with the maintained Markdown references in `docs`. It uses bundled Relay
branding and no runtime JavaScript or third-party page requests.

## Build and verify

```sh
python -m pip install -r website/requirements.txt
python scripts/build_docs.py
python scripts/verify_docs.py
python -m http.server 8765 --bind 127.0.0.1 --directory dist/docs
```

The output is `dist/docs`. Verification checks local links and fragments,
page headings, canonical URLs, descriptions, JSON-LD and exact sitemap coverage.
The documentation workflow repeats these checks and saves a build artifact.

## Publish

The production Cloudflare Pages project is `relay-backend`, with production
branch `main`. Deploy only a checked build from the current public main branch:

```sh
npx wrangler pages deploy dist/docs --project-name relay-backend --branch main
```

Use an existing authorized Cloudflare session. Do not put credentials in source
or command arguments. The repository workflow builds and checks the site; it
does not publish automatically or require new repository secrets.

The `relay-docs-redirect` Worker permanently redirects the former
`nibir.online/relay` and `nibir.online/relay/*` documentation paths to this site.
Its two routes do not cover the domain's homepage. Test changes with
`node --test website/redirect/worker.test.mjs`, then deploy using
`npx wrangler deploy --config website/redirect/wrangler.jsonc`.

## Content maintenance

Keep comparison claims scoped to verified features and link to competitor
documentation. Label unreleased functionality accurately. Add each new article
to `PAGES` in `scripts/build_docs.py` with its own title and description and
link it from the overview. Every generated page is included in the sitemap.
Avoid changing article dates simply to suggest freshness. Keep structured data
consistent with visible content; do not add invented ratings or testimonials.

The site publishes real HTML so readers and crawlers do not need JavaScript.
Sitemap discovery and crawl eligibility do not guarantee Google indexing,
rankings, snippets or AI Overview inclusion.
