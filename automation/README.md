# Static Codex Roadmap Loop v1

## Purpose

This directory contains the deliberately simple, static-roadmap Codex automation for Roadmap 2. It is a runner, not a planner: the prompt archive is authored and reviewed by a human, and the runner executes only the next approved static prompt.

## Architecture

```text
state
  ↓
static prompt
  ↓
fresh Codex
  ↓
Git gate
  ↓
next prompt
```

`run_loop.py` uses Python's standard library and treats observed Git state and process exit status as authoritative. It never generates prompts, summarizes Codex reports, semantically reviews code, chooses architecture, or performs automatic repair.

## Safety model

The runner stops instead of recovering automatically. It never resets, cleans, restores, checks out, stashes, reverts, amends, rewrites history, or invokes a repair Codex session. A stopped run leaves its evidence and repository state for human inspection.

Prompt files are deliberately static placeholders during setup. Each contains `AUTOMATION_PROMPT_NOT_READY` and a TODO marker, so the runner refuses to launch any roadmap stage until the prompt is separately supplied and reviewed. Do not execute P00 as part of this setup task.

## Files

- `ROADMAP2.md` fixes the stage order and scope boundary.
- `state.json` records the next sequential stage and observed successful commits. It is mutable runtime state and is intentionally ignored so runner transitions do not make a successful Codex commit appear dirty.
- `HERMES_RUNNER.md` defines Luna/Hermes' deterministic role.
- `prompts/` holds one static prompt per stage.
- `run_loop.py` is the local sequential runner.
- `tests/test_run_loop.py` exercises the runner with injected fake Git and Codex adapters.
- `runs/` contains minimal JSON execution evidence and is ignored by Git.

## First use

1. Inspect and review the static prompt archive.
2. Run a dry run: `python automation/run_loop.py --dry-run`.
3. After the P00 prompt is complete and reviewed, run one stage: `python automation/run_loop.py --max-tasks 1`.
4. Inspect the resulting commit and application behavior manually.
5. Only then increase the limit, for example `--max-tasks 3` or `--max-tasks 12`.

The setup dry run is expected to refuse P00 while the placeholder marker remains. Dry run reads state, validates the repository and prompt, prints what would execute, and makes no Git, state, run-log, npm, or Codex changes.

## Runtime controls

- `--max-tasks N` limits successful sequential stages in one invocation and defaults to `1`.
- `--resume` is required to retry a state whose status is `stopped`.
- `--dry-run` performs validation only.

The optional `independentValidation` setting defaults to `false`. Set `"independentValidation": true` in `state.json` only when the repository's `npm run validate` script should be run as an additional mechanical gate. If that script is absent, the runner stops clearly rather than inventing a command.

## Recovery

When a preflight, Codex process, Git gate, or optional validation fails, the runner reports the task, baseline, current HEAD, Git status, and reason, then records `stopped`. Human recovery is outside the runner: inspect the evidence, make an intentional repository decision, and use `--resume` only when the repository is clean and the next attempt is explicitly approved.
