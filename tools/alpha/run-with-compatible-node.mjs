import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , toolPath, ...toolArgs] = process.argv;

if (!toolPath) {
  throw new Error('Usage: node tools/alpha/run-with-compatible-node.mjs <tool-path> [tool-args...]');
}

function parseMajor(versionText) {
  const match = /^v?(?<major>\d+)/.exec(String(versionText).trim());
  return match?.groups?.major ? Number(match.groups.major) : null;
}

function getNodeMajor(binaryPath) {
  const result = spawnSync(binaryPath, ['-v'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  return parseMajor(result.stdout);
}

function selectCompatibleNode() {
  const currentMajor = parseMajor(process.version);
  if (currentMajor !== null && currentMajor <= 22) {
    return process.execPath;
  }

  const candidates = [
    process.env.HH_ALPHA_NODE ?? null,
    '/opt/homebrew/opt/node@20/bin/node',
    '/opt/homebrew/opt/node@22/bin/node',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const major = getNodeMajor(candidate);
    if (major !== null && major <= 22) {
      return candidate;
    }
  }

  throw new Error(
    [
      `Alpha TensorFlow tooling is not compatible with the current Node ${process.version}.`,
      'Install Homebrew node@20 or set HH_ALPHA_NODE to a compatible Node 20/22 binary.',
    ].join(' '),
  );
}

const nodeBinary = selectCompatibleNode();
const result = spawnSync(
  nodeBinary,
  ['--loader', './tools/esm-js-extension-loader.mjs', toolPath, ...toolArgs],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
