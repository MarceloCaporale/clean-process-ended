#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["bin", "src", "test", "scripts"];

const files = [];
for (const dir of DIRS) {
  walk(path.join(ROOT, dir), files);
}

const failures = [];
for (const file of files.filter((item) => /\.(mjs|js)$/i.test(item))) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    failures.push({
      file: path.relative(ROOT, file).replaceAll(path.sep, "/"),
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
}

if (failures.length) {
  process.stderr.write(JSON.stringify({ ok: false, checked: files.length, failures }, null, 2));
  process.exit(1);
}

process.stdout.write(JSON.stringify({ ok: true, checked: files.length }, null, 2));
process.stdout.write("\n");

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
}
