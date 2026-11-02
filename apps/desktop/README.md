# Relay desktop preview

Free, local API testing for Windows. The first slice provides standalone HTTP/HTTPS requests, per-request bearer auth, editable headers/raw bodies, cancellation, response inspection/copying and isolated in-memory drafts. No account or backend installation is required by the unpacked app.

[Windows roadmap and release gates](../../docs/WINDOWS.md)

For contributors: run `pnpm install`, `pnpm --filter @relay/desktop runtime:install`, `pnpm --filter @relay/desktop build`, then `pnpm --filter @relay/desktop start` from the repository root. `pnpm --filter @relay/desktop package:dir` creates an unpacked Windows x64 preview and validates its packaged entry page, assets and license notices. This is not a signed installer or public release.

The renderer is sandboxed and context-isolated. Only bundled assets load; request execution belongs to the main process behind validated IPC. TLS verification remains enabled and redirects are returned without following them. Tokens, drafts and responses are session-only. Collections, remembered credentials, import/export and installer lifecycle are later milestones.
