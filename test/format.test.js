import test from "node:test";
import assert from "node:assert/strict";
import { redactCommandLine } from "../src/format.js";

test("redacts common secret flag forms", () => {
  const redacted = redactCommandLine("node server.js --api-key SECRET --token SECRET2 -p password");
  assert.doesNotMatch(redacted, /SECRET|SECRET2|password/);
  assert.match(redacted, /--api-key \[redacted\]/);
});

test("redacts credentials embedded in URLs", () => {
  const redacted = redactCommandLine("curl https://user:pass@example.com/path");
  assert.doesNotMatch(redacted, /user:pass/);
  assert.match(redacted, /https:\/\/\[redacted\]@example.com/);
});

test("redacts quoted and provider-specific secret flags", () => {
  const redacted = redactCommandLine('node app.js --client-secret "my pass" --gh-token abc123 --password="quoted pass"');
  assert.doesNotMatch(redacted, /my pass|abc123|quoted pass/);
  assert.match(redacted, /--client-secret \[redacted\]/);
  assert.match(redacted, /--gh-token \[redacted\]/);
  assert.match(redacted, /--password=\[redacted\]/);
});

test("redacts env var style secrets", () => {
  const redacted = redactCommandLine("OPENAI_API_KEY sk-abc FOO_TOKEN=bar npm start");
  assert.doesNotMatch(redacted, /sk-abc|bar/);
  assert.match(redacted, /OPENAI_API_KEY \[redacted\]/);
  assert.match(redacted, /FOO_TOKEN=\[redacted\]/);
});

test("redacts broad provider secret aliases", () => {
  const redacted = redactCommandLine(
    'node app.js --oauth-client-secret abc --github-token def --anthropic-api-key="ghi" AWS_SECRET_ACCESS_KEY xyz AUTHORIZATION Bearer SECRET',
  );
  assert.doesNotMatch(redacted, /abc|def|ghi|xyz|Bearer SECRET/);
  assert.match(redacted, /--oauth-client-secret \[redacted\]/);
  assert.match(redacted, /--github-token \[redacted\]/);
  assert.match(redacted, /--anthropic-api-key=\[redacted\]/);
  assert.match(redacted, /AWS_SECRET_ACCESS_KEY \[redacted\]/);
  assert.match(redacted, /AUTHORIZATION \[redacted\]/);
});
