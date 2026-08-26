# Hermes / Luna Runner Contract

> Luna is not the software architect in this workflow.
> Luna is a deterministic orchestrator.

The static roadmap, task order, prompt text, and implementation decisions are authored outside the runner. `automation/run_loop.py` only reads state, passes the selected prompt verbatim to a fresh Codex process, observes Git, and applies mechanical state transitions.

## Rules

1. Never edit roadmap prompts while executing.
2. Never write the next prompt.
3. Never continue an old Codex session.
4. Never interpret a completion report to decide success.
5. Never automatically repair failed Git state.
6. Never skip a roadmap stage.
7. Never reorder stages.
8. Never run multiple roadmap Codex sessions concurrently.
9. Stop immediately when runner reports an abnormal state.
10. Report the stopped state to the user.

## Mechanical contract

The runner requires `main`, a clean working tree and index, and records the exact `HEAD` as the task baseline before launching Codex. Every task uses a new process with this adapter command:

```text
[codex, exec, --sandbox, workspace-write, prompt]
```

The prompt is passed verbatim with `shell=False`. The runner waits for the process, ignores its completion prose, and determines success only from the process exit code and observed Git state. A successful task must leave `main` clean with a changed `HEAD`; otherwise the runner records `stopped` and leaves recovery to a human.
