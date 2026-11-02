# Security

Do not post credentials, private traffic or exploit details in public issues.
Report a suspected vulnerability through [GitHub private vulnerability reporting](https://github.com/nibir-ai/relay/security/advisories/new).
If that option is unavailable, open an issue requesting a private reporting channel
without including sensitive details.

## Automated checks

The **Security and dependencies** workflow runs on pull requests, pushes to
`main`, daily and on manual dispatch. It checks:

- Python and JavaScript/TypeScript source with CodeQL's extended security queries.
- The full pnpm workspace lockfile, including desktop and development dependencies.
  High and critical JavaScript advisories fail the check.
- Freshly resolved Python backend, realtime, team-service, test and documentation
  dependencies with `pip-audit`. Any reported Python vulnerability fails the check.
- Newly introduced dependencies on pull requests with GitHub dependency review;
  high and critical findings fail the check.

Dependency reports are retained as workflow artifacts for 14 days, including on
failed runs. Source findings appear under the repository's code-scanning alerts.
Registry failures or missing scan permissions are failures, not clean results.
Scans identify known advisories and suspicious code; a passing scan is not a
complete security audit or evidence that every supported dependency version is safe.
Python resolves current compatible versions; minimum-supported versions remain a
separate compatibility and security review responsibility.

## Triage and fixes

Prioritize high/critical findings and reachable lower-severity problems affecting
credentials, request execution, local files or shared-service access. Check the
actual dependency path and affected code before changing packages. Distinguish
development-only dependencies from distributed runtime dependencies without
ignoring vulnerable build tools.

Apply a supported patched version or a narrowly scoped fix, rerun the relevant
consumer workflows and the scan, and preserve evidence of the result. Do not
silence a finding just to make CI green, run blind force upgrades, or publish a
package before its normal release gates pass. Any false-positive dismissal needs
a specific, documented reason. Sensitive remediation details stay private until
coordinated disclosure is appropriate.
