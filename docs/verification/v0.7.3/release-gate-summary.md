# v0.7.3 Release Gate Summary

Release target: GitHub public beta source.

npm publication is a separate release channel. Run public CI, external static audit from the GitHub URL and explicit maintainer approval before publishing to npm.

## Local gate

Command:

```bash
npm run public-beta-candidate
```

Expected sub-gates:

- ESLint;
- syntax check;
- Node test suite;
- MCP stdio smoke;
- strict package validation;
- public-tree check;
- production dependency audit;
- `npm pack --dry-run`;
- installed-tarball smoke test.

## Current local result

The local gate passed after the v0.7.3 validation-metrics and scanner-hardening pass:

- lint: OK;
- syntax: OK (`29` files checked);
- tests: `101/101`;
- MCP stdio smoke: OK (`24` tools exposed; required close-check/managed tools present);
- strict package validation: OK;
- public-tree check: OK;
- npm audit moderate-or-higher severity: `0` vulnerabilities;
- npm pack dry-run: OK (`clean-process-ended@0.7.3`, `87` files);
- installed-tarball smoke test: OK.

The tarball smoke gate installs the generated package in a temporary project and runs the shipped CLI through installed package shims and package paths, including `smoke-stdio`, `janitor-discovery`, installed-package validation and CLI help checks.

The v0.7.3 local gate also covers the macOS CI failure class found in v0.7.2:

- config path comparisons now use filesystem realpath identity instead of string equality;
- POSIX scanning supports both Linux/procps `etimes` and BSD/macOS `etime`;
- managed-runner lifecycle tests now assert observed managed identity without exposing command lines.

## Maintainer Authorization Gates

- GitHub Actions must pass on GitHub before tagged releases or registry/npm publication.
- External static audit should review the public GitHub URL before stronger distribution claims.
- Tags, GitHub Releases and npm publication require explicit maintainer approval.
- npm publication additionally requires accepted release notes, package checksums and current host evidence.
