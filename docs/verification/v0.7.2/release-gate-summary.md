# v0.7.2 Release Gate Summary

Release target: GitHub public beta source.

npm publication is a separate release channel. Run public CI, external static audit from the GitHub URL and explicit maintainer approval before publishing to npm.

## Local gate

Command:

```bash
npm run public-beta-candidate
```

Expected sub-gates:

- syntax check;
- Node test suite;
- MCP stdio smoke;
- strict package validation;
- public-tree check;
- production dependency audit;
- `npm pack --dry-run`.
- installed-tarball smoke test.

## Current local result

The local gate passed after the public README localization and standards alignment pass:

- syntax: OK;
- tests: `96/96`;
- MCP stdio smoke: OK;
- strict package validation: OK;
- public-tree check: OK;
- npm audit moderate-or-higher severity: 0 vulnerabilities;
- npm pack dry-run: OK;
- installed-tarball smoke test: OK.

The tarball smoke gate installs the generated package in a temporary project and runs the shipped CLI through installed package shims and package paths, including `smoke-stdio`, `janitor-discovery`, and installed-package validation.

## Maintainer Authorization Gates

- GitHub Actions must pass on GitHub before tagged releases or registry/npm publication.
- External static audit should review the public GitHub URL before stronger distribution claims.
- Tags, GitHub Releases and npm publication require explicit maintainer approval.
- npm publication additionally requires accepted release notes, package checksums and current host evidence.
