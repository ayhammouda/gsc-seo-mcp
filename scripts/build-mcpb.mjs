#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stageDirectory = resolve(repoRoot, ".mcpb-stage");
const manifestPath = resolve(repoRoot, "mcpb", "manifest.json");
const packageJsonPath = resolve(repoRoot, "package.json");
const packageLockPath = resolve(repoRoot, "package-lock.json");
const mcpbCliPath = resolve(
  repoRoot,
  "node_modules",
  "@anthropic-ai",
  "mcpb",
  "dist",
  "cli",
  "cli.js"
);

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (packageJson.version !== manifest.version) {
  throw new Error(
    `MCPB manifest version ${manifest.version} does not match package version ${packageJson.version}`
  );
}

const requestedOutput = process.argv[2];
const outputPath = resolve(
  repoRoot,
  requestedOutput ?? `artifacts/gsc-seo-mcp-v${packageJson.version}.mcpb`
);
const checksumPath = `${outputPath}.sha256`;

async function run(command, args, cwd = repoRoot) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

await rm(stageDirectory, { recursive: true, force: true });
await mkdir(resolve(stageDirectory, "server"), { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });

try {
  await cp(manifestPath, resolve(stageDirectory, "manifest.json"));
  await cp(resolve(repoRoot, "dist"), resolve(stageDirectory, "server", "dist"), {
    recursive: true
  });
  await Promise.all(
    ["README.md", "LICENSE", "SECURITY.md", "CHANGELOG.md"].map((filename) =>
      cp(resolve(repoRoot, filename), resolve(stageDirectory, filename))
    )
  );

  await cp(packageJsonPath, resolve(stageDirectory, "package.json"));
  await cp(packageLockPath, resolve(stageDirectory, "package-lock.json"));
  await run(
    "npm",
    ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    stageDirectory
  );
  await rm(resolve(stageDirectory, "package.json"));
  await rm(resolve(stageDirectory, "package-lock.json"));
  await rm(resolve(stageDirectory, "node_modules", ".package-lock.json"), { force: true });

  await run(process.execPath, [mcpbCliPath, "validate", resolve(stageDirectory, "manifest.json")]);
  await rm(outputPath, { force: true });
  await rm(checksumPath, { force: true });
  await run(process.execPath, [mcpbCliPath, "pack", stageDirectory, outputPath]);

  const digest = createHash("sha256").update(await readFile(outputPath)).digest("hex");
  await writeFile(checksumPath, `${digest}  ${basename(outputPath)}\n`, "utf8");
  process.stdout.write(`SHA-256: ${digest}\n`);
  process.stdout.write(`Bundle: ${outputPath}\n`);
  process.stdout.write(`Checksum: ${checksumPath}\n`);
} finally {
  await rm(stageDirectory, { recursive: true, force: true });
}
