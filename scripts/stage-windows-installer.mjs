#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const targetRoot = path.join(appRoot, "src-tauri", "target");
const releaseDir = path.join(appRoot, "releases");
const stagedName = "besmir-spitex-einsatzplanung-windows.exe";

function findInstallers(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findInstallers(entryPath);
    if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".exe") &&
      entryPath.includes(`${path.sep}bundle${path.sep}nsis${path.sep}`)
    ) {
      return [{ path: entryPath, mtimeMs: statSync(entryPath).mtimeMs }];
    }
    return [];
  });
}

const installer = findInstallers(targetRoot).sort(
  (left, right) => right.mtimeMs - left.mtimeMs,
)[0];
if (!installer) {
  console.error("No NSIS .exe installer found under src-tauri/target.");
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
copyFileSync(installer.path, path.join(releaseDir, stagedName));
console.log(
  `Staged ${path.relative(appRoot, installer.path)} -> releases/${stagedName}`,
);
