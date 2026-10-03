#!/usr/bin/env node
/**
 * Prepares a desktop wrapper to load the hosted Payroll application.
 * Only PAYROLL_BACKEND_URL (public metadata) is written to desktop resources.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const resourcesArg = process.argv[2];
const resources = resourcesArg
  ? (resourcesArg.startsWith("/") || /^[A-Za-z]:[\\/]/.test(resourcesArg)
      ? resourcesArg
      : join(root, resourcesArg))
  : join(root, "src-tauri", "resources");

function normalizeBackendUrl(value) {
  if (!value) {
    throw new Error(
      "PAYROLL_BACKEND_URL is required. Set it to the public HTTPS URL where Payroll is deployed."
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PAYROLL_BACKEND_URL must be a valid absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "PAYROLL_BACKEND_URL must be an HTTPS URL without credentials, query parameters, or a fragment."
    );
  }
  url.pathname = "/";
  return url.toString();
}

function main() {
  const backendUrl = normalizeBackendUrl(process.env.PAYROLL_BACKEND_URL);
  mkdirSync(resources, { recursive: true });
  for (const target of ["server", "node", "node.exe", "_node_tmp"]) {
    rmSync(join(resources, target), { recursive: true, force: true });
  }
  for (const entry of readdirSync(resources, { withFileTypes: true })) {
    if (entry.name.startsWith(".env")) {
      rmSync(join(resources, entry.name), { recursive: true, force: true });
    }
  }
  writeFileSync(
    join(resources, "backend-config.json"),
    `${JSON.stringify({ backendUrl }, null, 2)}\n`,
    { mode: 0o644 }
  );
  console.log(`[desktop:prepare] Staged public backend URL for ${new URL(backendUrl).origin}. No server credentials were packaged.`);
}

main();
