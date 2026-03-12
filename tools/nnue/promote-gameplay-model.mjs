import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  deserializeNNUEModel,
  serializeNNUEModel,
  validateNNUEModel,
} from '../../packages/ai/dist/index.js';
import { parseArgs, readJson } from './common.mjs';
import {
  DEFAULT_GAMEPLAY_MODEL_OVERRIDE_FILE,
  DEFAULT_GAMEPLAY_PROMOTION_ARCHIVE_ROOT,
  buildPromotedGameplaySerializedModel,
  buildPromotionArchiveRecord,
  createPromotionArchiveDirName,
  normalizePromotionGateResult,
  renderDefaultGameplayOverrideModule,
} from './promotion-helpers.mjs';

function runWorkspaceBuild(cwd) {
  const result = spawnSync('pnpm', ['build'], {
    cwd,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Workspace build failed with exit code ${result.status ?? 1}.`);
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function updateArchiveIndex(indexPath, record) {
  const existing = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    : [];

  if (!Array.isArray(existing)) {
    throw new Error(`Promotion archive index "${indexPath}" is not an array.`);
  }

  existing.push(record);
  writeJsonFile(indexPath, existing);
}

export function promoteGameplayModel(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const modelArg = typeof args.model === 'string' ? args.model : null;
  if (!modelArg) {
    throw new Error(
      'Usage: pnpm nnue:promote --model tmp/.../candidate-gameplay-model.json [--gate-summary tmp/.../gate-summary.json] [--force] [--no-build] [--archive-root archive/nnue/gameplay-promotions] [--out-file packages/ai/src/engine/default-gameplay-model-override.ts]',
    );
  }

  const cwd = process.cwd();
  const modelPath = path.resolve(cwd, modelArg);
  const gateSummaryPath = typeof args['gate-summary'] === 'string'
    ? path.resolve(cwd, String(args['gate-summary']))
    : null;
  const outFile = path.resolve(
    cwd,
    typeof args['out-file'] === 'string'
      ? String(args['out-file'])
      : DEFAULT_GAMEPLAY_MODEL_OVERRIDE_FILE,
  );
  const archiveRoot = path.resolve(
    cwd,
    typeof args['archive-root'] === 'string'
      ? String(args['archive-root'])
      : DEFAULT_GAMEPLAY_PROMOTION_ARCHIVE_ROOT,
  );
  const force = args.force === true;
  const shouldBuild = args['no-build'] !== true;

  const parsedModel = readJson(modelPath);
  const model = deserializeNNUEModel(parsedModel);
  validateNNUEModel(model, 'gameplay');

  const gateSummary = gateSummaryPath ? readJson(gateSummaryPath) : null;
  const gateResult = normalizePromotionGateResult(gateSummary, model.manifest.modelId, force);
  const promotedAt = new Date().toISOString();
  const promotedModel = buildPromotedGameplaySerializedModel(
    serializeNNUEModel(model),
    DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  );
  const archiveDir = path.join(
    archiveRoot,
    createPromotionArchiveDirName(model.manifest.modelId, promotedAt),
  );
  const archivedModelPath = path.join(archiveDir, 'candidate-gameplay-model.json');
  const archivedGateSummaryPath = gateSummaryPath
    ? path.join(archiveDir, 'gate-summary.json')
    : null;
  const archiveRecordPath = path.join(archiveDir, 'promotion-record.json');
  const archiveIndexPath = path.join(archiveRoot, 'index.json');

  const overrideSource = renderDefaultGameplayOverrideModule(promotedModel, {
    sourceModelId: model.manifest.modelId,
    sourceModelPath: modelPath,
    gateSummaryPath,
    promotedAt,
    gateResult,
  });

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.copyFileSync(modelPath, archivedModelPath);
  if (gateSummaryPath && archivedGateSummaryPath) {
    fs.copyFileSync(gateSummaryPath, archivedGateSummaryPath);
  }

  const archiveRecord = buildPromotionArchiveRecord({
    archiveDir,
    sourceModelId: model.manifest.modelId,
    sourceModelPath: modelPath,
    archivedModelPath,
    gateSummaryPath,
    archivedGateSummaryPath,
    promotedAt,
    promotedModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    gateResult,
  });
  writeJsonFile(archiveRecordPath, archiveRecord);
  updateArchiveIndex(archiveIndexPath, archiveRecord);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, overrideSource, 'utf8');

  if (shouldBuild) {
    runWorkspaceBuild(cwd);
  }

  return {
    sourceModelId: model.manifest.modelId,
    promotedModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    gateSummaryPath,
    archiveDir,
    archiveRecordPath,
    archiveIndexPath,
    outFile,
    rebuilt: shouldBuild,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const summary = promoteGameplayModel();
  console.log(JSON.stringify(summary, null, 2));
}
