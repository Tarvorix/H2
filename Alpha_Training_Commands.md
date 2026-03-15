# Alpha Training Commands

This is the current safe command reference for Alpha training in this repo.

## Rule

Use the `pnpm alpha:*` scripts.

Do **not** run these directly with raw `node`:

```bash
node tools/alpha/train.mjs ...
node tools/alpha/self-play.mjs ...
node tools/alpha/gate.mjs ...
```

Use these instead:

```bash
pnpm alpha:train ...
pnpm alpha:selfplay ...
pnpm alpha:gate ...
```

Reason:

- `alpha:train`
- `alpha:selfplay`
- `alpha:gate`

now auto-route through the compatible Node wrapper and the native TensorFlow backend.

## Current Finished 100-Game Distill

Current finished distill root:

```bash
tmp/alpha/overnight-20260313-022026/distill
```

Current manifest:

```bash
tmp/alpha/overnight-20260313-022026/distill/manifest.json
```

Current corpus size:

- `100` matches
- `19464` samples

## Restart From The Existing 100-Game Distill

This reuses the finished distill and restarts at train -> self-play -> retrain -> gate.

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && DISTILL="$ROOT/distill" && TRAIN0="$ROOT/train-r0-restart" && SELF1="$ROOT/selfplay-r1-restart" && TRAIN1="$ROOT/train-r1-restart" && GATE="$ROOT/gate-restart" && pnpm build && pnpm alpha:train --input "$DISTILL/manifest.json" --out-dir "$TRAIN0" --model-id alpha-r0 && pnpm alpha:selfplay --model-file "$TRAIN0/alpha-r0.json" --matches 100 --curriculum mirror --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out-dir "$SELF1" && pnpm alpha:train --model "$TRAIN0/alpha-r0.json" --input "$DISTILL/manifest.json,$SELF1/manifest.json" --out-dir "$TRAIN1" --model-id alpha-r1 && pnpm alpha:gate --model "$TRAIN1/alpha-r1.json" --matches 10 --threshold 0.55 --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out "$GATE/alpha-r1.gate.json"
```

## Train Only From The Existing 100-Game Distill

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && DISTILL="$ROOT/distill" && TRAIN0="$ROOT/train-r0-restart" && pnpm build && pnpm alpha:train --input "$DISTILL/manifest.json" --out-dir "$TRAIN0" --model-id alpha-r0
```

Output:

- model: `tmp/alpha/overnight-20260313-022026/train-r0-restart/alpha-r0.json`
- summary: `tmp/alpha/overnight-20260313-022026/train-r0-restart/alpha-r0.summary.json`

## Run Alpha Self-Play From A Trained Candidate

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && TRAIN0="$ROOT/train-r0-restart" && SELF1="$ROOT/selfplay-r1-restart" && pnpm alpha:selfplay --model-file "$TRAIN0/alpha-r0.json" --matches 100 --curriculum mirror --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out-dir "$SELF1"
```

Output:

- manifest: `tmp/alpha/overnight-20260313-022026/selfplay-r1-restart/manifest.json`

## Retrain From Distill + Self-Play

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && DISTILL="$ROOT/distill" && TRAIN0="$ROOT/train-r0-restart" && SELF1="$ROOT/selfplay-r1-restart" && TRAIN1="$ROOT/train-r1-restart" && pnpm alpha:train --model "$TRAIN0/alpha-r0.json" --input "$DISTILL/manifest.json,$SELF1/manifest.json" --out-dir "$TRAIN1" --model-id alpha-r1
```

Output:

- model: `tmp/alpha/overnight-20260313-022026/train-r1-restart/alpha-r1.json`
- summary: `tmp/alpha/overnight-20260313-022026/train-r1-restart/alpha-r1.summary.json`

## Gate The Retrained Candidate

This is `10` matches per opponent, not `10` total.

At current repo behavior that means:

- `10` vs Tactical
- `10` vs Engine
- `10` vs Alpha Default if the candidate is not already `alpha-default-v1`

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && TRAIN1="$ROOT/train-r1-restart" && GATE="$ROOT/gate-restart" && pnpm alpha:gate --model "$TRAIN1/alpha-r1.json" --matches 10 --threshold 0.55 --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out "$GATE/alpha-r1.gate.json"
```

Output:

- gate summary: `tmp/alpha/overnight-20260313-022026/gate-restart/alpha-r1.gate.json`

## Promote The Candidate After Gate

```bash
ROOT="tmp/alpha/overnight-20260313-022026" && TRAIN1="$ROOT/train-r1-restart" && GATE="$ROOT/gate-restart" && pnpm alpha:promote --model "$TRAIN1/alpha-r1.json" --gate-summary "$GATE/alpha-r1.gate.json"
```

This updates:

- `packages/ai/src/alpha/default-alpha-model-override.ts`

and archives the promotion under:

- `archive/alpha/promotions/`

## Inspect A Corpus

Inspect the finished distill:

```bash
pnpm alpha:inspect --input tmp/alpha/overnight-20260313-022026/distill/manifest.json
```

Inspect self-play:

```bash
pnpm alpha:inspect --input tmp/alpha/overnight-20260313-022026/selfplay-r1-restart/manifest.json
```

## Fresh Full Overnight Run From Scratch

This does:

- full build
- fresh `100`-game Engine-vs-Engine distill at `1000ms`
- first Alpha train
- `100` Alpha self-play games at `1000ms / 640 sims`
- retrain on distill + self-play
- gate at `10` matches per opponent

```bash
STAMP=$(date +%Y%m%d-%H%M%S) && ROOT="tmp/alpha/overnight-$STAMP" && DISTILL="$ROOT/distill" && TRAIN0="$ROOT/train-r0" && SELF1="$ROOT/selfplay-r1" && TRAIN1="$ROOT/train-r1" && GATE="$ROOT/gate" && pnpm build && pnpm alpha:distill --matches 100 --time-budget-ms 1000 --max-commands 2000 --out-dir "$DISTILL" && pnpm alpha:train --input "$DISTILL/manifest.json" --out-dir "$TRAIN0" --model-id alpha-r0 && pnpm alpha:selfplay --model-file "$TRAIN0/alpha-r0.json" --matches 100 --curriculum mirror --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out-dir "$SELF1" && pnpm alpha:train --model "$TRAIN0/alpha-r0.json" --input "$DISTILL/manifest.json,$SELF1/manifest.json" --out-dir "$TRAIN1" --model-id alpha-r1 && pnpm alpha:gate --model "$TRAIN1/alpha-r1.json" --matches 10 --threshold 0.55 --time-budget-ms 1000 --max-simulations 640 --max-commands 2000 --out "$GATE/alpha-r1.gate.json"
```

## Minimal Smoke Commands

Tiny train smoke:

```bash
pnpm alpha:train --input tmp/alpha/distill-rerun-cli-smoke-20260313-diagnostics-restore/manifest.json --epochs 1 --batch-size 2 --out-dir tmp/alpha/train-script-smoke-20260313 --model-id alpha-script-smoke
```

Tiny self-play smoke:

```bash
pnpm alpha:selfplay --model-file tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --curriculum mirror --time-budget-ms 5 --max-simulations 32 --max-commands 5 --out-dir tmp/alpha/selfplay-script-smoke-20260313
```

Tiny gate smoke:

```bash
pnpm alpha:gate --model tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --threshold -1 --time-budget-ms 5 --max-simulations 32 --max-commands 5 --out tmp/alpha/gate-script-smoke-20260313.json
```
