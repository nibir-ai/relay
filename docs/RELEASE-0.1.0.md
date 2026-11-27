# Relay 0.1.0 beta

Relay 0.1.0 is the first planned beta after 0.0.5. It carries forward the repeatable testing and reviewed exports originally planned for 0.0.6. The [backend acceptance checklist](RELEASE-0.0.6.md) still applies to the beta. The Windows release uses the separate `desktop/v0.1.0` tag.

The native Windows workspace uses Rust and Rune. It sends standalone HTTP and HTTPS requests with explicit methods, parameters, headers, bodies and per-tab Bearer, Basic or header-based API key authentication. It has a request rail, method and theme dropdowns, a wide response pane and session-only result summaries. It imports literal HTTP request methods and URLs from Postman Collection v2 into editable drafts for review. It requires no account or service.

- [ ] Complete the backend checks on candidate Python and Node artifacts. Verify fresh installs, 0.0.5 upgrades, framework compatibility, auth isolation, request execution, response inspection and both reviewed exports in the browser.
- [ ] Complete the Windows checks on the exact candidate. Verify clean install, launch, upgrade, uninstall, request and auth workflows, failure and cancellation, storage, both exports, all themes, keyboard access and supported display scaling.
- [ ] Verify licensing and provenance of dependencies and fonts, audit the candidate packages and inspect shipping artifacts for private files.
- [ ] Publish each release track when its gates pass. Verify fresh registry installs or the public Windows download after publication.

Named collections, environments, persistent credential profiles, reviewed desktop exports and broader Postman import remain on the [Windows roadmap](WINDOWS.md).
