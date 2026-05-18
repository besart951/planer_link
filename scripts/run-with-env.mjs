#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function withDesktopEnv() {
  const rootEnv = parseEnvFile(path.join(repoRoot, ".env"));
  const appEnv = parseEnvFile(path.join(appRoot, ".env"));
  const env = { ...process.env, ...rootEnv, ...appEnv };

  env.BUILD_TARGET = "desktop";
  env.VITE_BUILD_TARGET = "desktop";
  env.VITE_BESMIR_API_BASE_URL ||=
    env.BESMIR_PUBLIC_API_BASE_URL ||
    (env.BASE_DOMAIN ? `https://cloud.${env.BASE_DOMAIN}/besmir` : "");
  env.VITE_BESMIR_SYNC_API_TOKEN ||=
    env.BESMIR_SYNC_API_TOKEN || env.SYNC_API_TOKEN || "";

  return env;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const mode = process.argv[2] ?? "build";
const env = withDesktopEnv();

if (mode === "dev") {
  run("pnpm", ["exec", "vite", "dev", "--host", "0.0.0.0"], env);
} else if (mode === "build") {
  run("pnpm", ["exec", "svelte-kit", "sync"], env);
  run("pnpm", ["exec", "vite", "build"], env);
} else {
  console.error(`Unknown desktop env mode: ${mode}`);
  process.exit(1);
}
