# Release Process

This process is for the public GitHub/npm line. It does not apply to LAB audit packages.

## 1. Prepare Public Tree

1. Review version in `package.json`, `package-lock.json`, `server.json`, CLI help and release notes.
2. Review all localized READMEs: `README.md`, `README_ES.md`, `README_DE.md`, `README_PT_BR.md`, `README_ZH.md` and `README_JA.md`. They must be equivalent in content.
3. Review `AGENTS.md`, `docs/README.md`, `docs/quickstart.md`, `docs/design-decisions.md`, `docs/support-matrix.md`, `docs/validation/`, `schemas/`, `examples/` and `docs/PUBLICATION_READINESS.md`.
4. Confirm `.gitignore` excludes local evidence, audit bundles, package zips, tarballs and root checksum files.

## 2. Run Local Gates

```bash
npm run public-beta-candidate
```

Do not continue if any gate fails.
This gate includes a smoke test that installs the generated tarball in a temporary project and runs the shipped CLI from the installed package, not only from the working tree.

## 3. Refresh Host Evidence

Validate the exact candidate in each advertised host. Keep dry-run only.

Recommended order:

1. Codex Desktop;
2. Claude Code;
3. Gemini CLI;
4. Qwen Code CLI with an Ollama-backed Qwen model workflow;
5. any additional host only after a concrete validation target is approved.

For each host, record the expected profile, watcher state, `storeCommandLines`, ownership counts, cleanup dry-run result and selected `process_explain` outputs.

## 4. Package

Use `npm pack --dry-run --json` first and keep `npm run package:smoke-tarball` passing. If a real artifact is needed for pre-publication audit, create it deliberately and capture its SHA-256.

Do not include `node_modules` or local evidence folders.

## 5. GitHub Preparation

Before pushing:

- inspect `git status --short`;
- inspect `git diff --check`;
- inspect the files that will be committed;
- ensure no private path, generated audit pack or local receipt is staged;
- confirm `docs/support-matrix.md` matches real evidence.
- confirm GitHub description and topics match `docs/discoverability.md`.

## 6. Public GitHub Audit

After pushing the branch but before any tag, GitHub Release or npm publication:

1. wait for GitHub Actions to pass;
2. run or request external static audit from the public GitHub URL;
3. apply any accepted corrections as normal commits;
4. rerun `npm run public-beta-candidate`;
5. do not treat any additional host as natively validated unless that host session called the MCP tools directly and sanitized evidence was captured.

## 7. Publish

Publishing requires an explicit human decision. Do not run `npm publish`, create GitHub releases, push tags or push to `github.com` from an agent without direct authorization.

Suggested order after approval:

1. commit public tree;
2. push branch;
3. wait for GitHub Actions;
4. complete external static audit;
5. create tag;
6. create GitHub release with release notes and checksums;
7. publish npm package only after release approval;
8. update support matrix if host evidence changed during release.
