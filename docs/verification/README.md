# Verification

This directory documents public verification state. It should contain stable summaries, not private local evidence dumps.

Raw host evidence bundles may be generated locally with:

```bash
cpe-scan audit-bundle --output-dir ./evidence/cpe --json
```

Those bundles are not shipped in the npm package by default. If evidence is published, sanitize it first and confirm:

- no cleanup real was executed;
- no command lines are included by default;
- no tokens, environment variables, secrets or raw process output are included;
- SHA-256 checksums cover the published evidence files.
