import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { json, type RequestHandler } from "@sveltejs/kit";

const installerExtensions = new Set([".exe", ".msi"]);

async function readPassword(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as { password?: unknown };
    return typeof payload.password === "string" ? payload.password : "";
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const value = form.get("password");
    return typeof value === "string" ? value : "";
  }

  return request.text();
}

function equalSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function newestInstallerFromDirectory(
  directory: string,
): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const candidates = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          installerExtensions.has(path.extname(entry.name).toLowerCase()),
      )
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const fileStat = await stat(filePath);
        return {
          filePath,
          mtimeMs: fileStat.mtimeMs,
          isExe: path.extname(entry.name).toLowerCase() === ".exe",
        };
      }),
  );

  candidates.sort(
    (left, right) =>
      Number(right.isExe) - Number(left.isExe) || right.mtimeMs - left.mtimeMs,
  );
  return candidates[0]?.filePath ?? null;
}

async function installerPath(): Promise<string | null> {
  const configuredPath = process.env.WINDOWS_INSTALLER_PATH?.trim();
  if (configuredPath && (await pathExists(configuredPath))) {
    return configuredPath;
  }

  const releaseDir =
    process.env.WINDOWS_RELEASE_DIR?.trim() ||
    path.resolve(process.cwd(), "releases");
  return newestInstallerFromDirectory(releaseDir);
}

function contentTypeFor(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".msi"
    ? "application/x-msi"
    : "application/vnd.microsoft.portable-executable";
}

export const POST: RequestHandler = async ({ request }) => {
  const expectedPassword = process.env.WINDOWS_DOWNLOAD_PASSWORD?.trim();
  if (!expectedPassword) {
    return json(
      { error: "Windows download is not configured." },
      { status: 503 },
    );
  }

  const password = (await readPassword(request)).trim();
  if (!equalSecret(password, expectedPassword)) {
    return json({ error: "Unauthorized download." }, { status: 401 });
  }

  const filePath = await installerPath();
  if (!filePath) {
    return json(
      { error: "Windows installer is not available yet." },
      { status: 404 },
    );
  }

  const fileStat = await stat(filePath);
  const filename = path.basename(filePath);

  return new Response(Readable.toWeb(createReadStream(filePath)) as BodyInit, {
    headers: {
      "content-type": contentTypeFor(filePath),
      "content-length": String(fileStat.size),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};
