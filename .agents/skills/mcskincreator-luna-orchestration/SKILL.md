---
name: mcskincreator-luna-orchestration
description: Choose bounded Codex/Work subagent topologies for MinecraftSkinCreator by task uncertainty; serialize shared-state writes, isolate alternatives, and require structured review contracts. Use for multi-agent design, feature, debugging, research, audit, architecture, or security work; do not use for ordinary single-agent edits.
---

# MinecraftSkinCreator Work orchestration

Use this skill when the root agent must decide whether and how to delegate work.
It governs topology, ownership, evidence flow, review, and stopping conditions.
It does not replace the repository's product, engineering, security, or
validation rules in `AGENTS.md`.

## Authority and preflight

- The root agent is the sole orchestrator and adjudicator. `Luna Max` is a
  model/runtime choice, not a second role or a permission grant.
- Read the root `AGENTS.md` and the task's directly relevant product contracts
  before dispatching anyone. Those documents remain authoritative for
  `SkinDocument`, exact RGBA behavior, UV/3D correctness, Electron security,
  validation, scope, and Git handling.
- Classify the task before choosing a topology. Do not spawn agents merely
  because the task is large; spawn them when their cognition is independent
  and the returned evidence will change a decision.
- Record the current branch, `HEAD`, and worktree/index state before any
  writer starts. Preserve pre-existing user changes. A dirty shared checkout
  is not a production-writer target; use an isolated worktree when supported
  or stay read-only and report the constraint.
- Give every delegated agent a bounded role, explicit read/write boundary,
  relevant paths, and the required result contract. The root waits for all
  requested analysis lanes before synthesis.

## Epistemic routing

Use the smallest topology that fits the uncertainty and mutation risk.

| State | Signals | Default topology |
| --- | --- | --- |
| E0: known and deterministic | Acceptance criteria and code path are clear; change is small and local. | Root only, or one writer. No delegation by default. |
| E1: uncertain but read-heavy | The relevant path, behavior, framework detail, or evidence is unclear. | Two to four independent read-only analysts in parallel; root synthesizes before any write. |
| E2: production mutation | The decision is made and a shared checkout must change. | One serialized production writer at a time, followed by only the reviews that fit the risk. |
| E3: product/design ambiguity | The desired interaction, visual direction, or scope is not settled. | Parallel read-only design/engineering analysis; prototypes only in isolated worktrees; human gate before durable selection. |
| E4: consequential or high-risk | Architecture boundaries, security, file format, lifecycle, permissions, or irreversible product choices are involved. | Independent read-only correctness/security/engineering review; root adjudication; human gate when the choice changes the contract or risk posture. |

The governing rule is: parallelize independent cognition aggressively and
serialize shared-state mutation conservatively.

## Default topology

For work that is not E0, use this shape unless a narrower shape is safer:

```text
root classify
  -> parallel read-only analysis (only when independent)
  -> root synthesis and decision
  -> one serialized production writer
  -> independent visual review and/or engineering review
  -> bounded revision loop
  -> human gate when consequential
```

- Analysts explore, reproduce, compare, or audit. They do not edit the
  canonical checkout, choose product direction on the owner's behalf, or
  silently turn an unknown into an assumption.
- The writer owns the implementation slice after the root has synthesized the
  evidence. There is never concurrent production writing in one checkout.
- Reviewers receive the same accepted scope and inspect the result
  independently. A visual reviewer checks interaction, hierarchy, density,
  responsive states, and screenshots/manual evidence where available. An
  engineering reviewer checks behavior, architecture, regressions, tests,
  and security boundaries.
- The root collects concise summaries, not uncontrolled raw transcripts, and
  resolves disagreements using file-level evidence. Keep FACT, INFERENCE, and
  UNKNOWN distinct.
- Delegated agents do not delegate again by default. A nested delegation is
  allowed only when the root explicitly authorizes it, names the child scope,
  and records why one additional level materially helps.

## Task routing

### Design tasks

- If the task is a known token/layout adjustment with settled acceptance
  criteria, E0 or E2 is sufficient: one writer and proportional review.
- If the task changes interaction hierarchy, visual language, or product
  behavior, run independent read-only visual/UX and engineering audits first.
- Do not let a prototype silently become the product decision. Present the
  alternatives, tradeoffs, and evidence to the human when the choice affects
  product direction, accessibility, canonical behavior, or scope.
- For an implemented UI change, use both visual and engineering review when
  the change crosses the shell, canvas, inspector, 3D preview, documents, or
  responsive behavior.

### Feature tasks

- Trace `entry point -> state/data source -> selection/write path` before
  splitting work. Parallelize mapping, test-gap analysis, or documentation
  checks only when their scopes are independent.
- Use one production writer by default. Keep the slice compatible with the
  canonical architecture instead of asking multiple agents to edit adjacent
  files and reconciling competing assumptions later.
- Require behavior-focused validation and the repository's applicable checks;
  do not infer completion from a successful process or a screenshot alone.

### Debugging

- For a small, reproducible defect, use one agent: reproduce, add a focused
  regression check where practical, fix the cause, and validate the related
  subsystem.
- For an uncertain defect, run a read-only reproducer/browser lane and a
  read-only code-path mapper in parallel. Add a test/log lane only if it is
  genuinely independent. Then give the fix to one writer.
- Do not authorize speculative rewrites before the failure mode is evidenced.
  A late or contradictory observation is `UNKNOWN` until reproduced or
  explained.

### Research and audit

- Keep the whole phase read-only. Use parallel lanes for repository facts,
  official documentation, dependency/runtime behavior, visual evidence, or
  security risk only when each lane has a distinct question.
- Each result must separate checked facts, inference, unknowns, and a bounded
  recommendation. No analyst edits code, prompts, configuration, or runtime
  state during an audit.
- If the audit produces an approved fix, start a new serialized writer phase;
  do not let an audit agent mutate the checkout as a side effect.

### Alternative prototypes

- Use alternatives only when the decision is genuinely unsettled and the
  benefit of comparison exceeds integration cost.
- Every prototype writer gets an isolated worktree from the same verified
  baseline and the same brief. A Worktree control must be real and observable;
  do not simulate isolation with naming or promises.
- Prototype writers must not share files, generated output, running state, or
  a branch checkout. Do not merge all alternatives. Review and compare them,
  select one through the appropriate human gate, then use one serialized
  integration writer.
- If isolated worktrees are unavailable, collapse the alternatives to
  read-only proposals or run them sequentially; never run concurrent writers
  in the canonical checkout.

### Architecture and security review

- Run independent read-only reviewers for correctness/architecture and
  security when a change crosses source-of-truth boundaries, IPC/preload,
  navigation/window permissions, file formats, lifecycle, or external
  content.
- Reviewers report findings; they do not implement fixes in the same review
  phase. The root adjudicates conflicts and chooses whether a follow-up
  writer is authorized.
- Any change to the security posture, privilege boundary, persistent format,
  or core product contract requires a human gate. Do not treat passing tests
  as approval for that decision.

## Shared-state rules

- At most one context may mutate a given checkout at a time. This includes
  tracked files, project configuration, prompts, and durable generated state.
- Read-only means no `apply_patch`, no file rewrites, no dependency changes,
  no branch/state mutation, and no uncontained generated artifacts. If a tool
  cannot provide that boundary, the agent must report the limitation.
- A worktree is an isolation boundary, not an integration decision. Verify its
  baseline and final diff before selecting any output.
- Do not invoke `automation/run_loop.py` from a delegated agent to create a
  second orchestration layer. Its static roadmap and `HERMES_RUNNER.md`
  contract remain separate and authoritative when the user explicitly runs
  that roadmap.

## Result contract

Every analyst, writer, and reviewer returns a concise result with this shape:

```text
status: PASS | REVISE | BLOCKED
role: <bounded role>
scope: <paths/questions covered>
facts: <checked observations with file/symbol/command references>
inferences: <reasoned conclusions, clearly labelled>
unknowns: <unresolved questions or unavailable evidence>
findings: <severity, impact, and exact required changes>
evidence: <tests, screenshots, reproductions, diffs, or source links>
next: <one bounded next action>
revision: <0 for initial result; 1 or 2 for a revision>
```

- `PASS` means the stated scope is complete and evidence supports it; it
  does not approve an unresolved human decision.
- `REVISE` names actionable findings, their severity, the owner, and the
  exact acceptance condition for the next pass. It is not a request for an
  open-ended polish loop.
- `BLOCKED` names the missing decision, authority, environment, evidence, or
  clean state. It stops further mutation until the blocker is resolved.
- A missing report, a clean process exit, or an unchanged screenshot is not
  evidence of `PASS`.

## Revision and human gates

- The default limit is two revision cycles after the initial production
  result. Re-run only the affected independent reviews after each revision.
- If any required reviewer still returns `REVISE` after cycle 2, return
  `BLOCKED` with the unresolved findings. Expanding scope is a new task, not a
  way around the bound.
- Use a human gate before selecting among product/design alternatives or
  changing scope, architecture, security posture, persistent format,
  permissions, or other consequential behavior. Until the owner answers,
  report `BLOCKED` and do not write.
- The root may continue automatically only for mechanical, pre-authorized
  validation and bounded revisions that do not make a new consequential
  choice.

## Runtime boundary and gaps

This skill is the versionable policy layer. It is not a lock, scheduler, hook,
sandbox, or proof that Work exposed the requested agent topology.

- When the runtime exposes read-only sandbox settings, use them for analysts
  and reviewers. When it exposes isolated worktrees, use them for alternatives.
  If either control is unavailable, fall back to serial execution or report
  `BLOCKED`; do not claim the boundary exists.
- The repository currently has no project `.codex/config.toml`, custom-agent
  definitions, or hook configuration. Do not imply that this file creates
  any of them.
- The existing `automation/run_loop.py` supplies mechanical enforcement only
  for its own static roadmap: fresh Codex process, sequential stages, `main`,
  clean worktree/index, changed `HEAD`, and stop-with-evidence behavior. It is
  not a general Work topology controller.
- Project-local skill discovery is the intended Codex/desktop placement. A
  hosted ChatGPT Work surface may require plugin packaging for distribution;
  do not claim this repository file is automatically available there unless
  the active client confirms it.

## Root completion report

Before declaring the task complete, report:

- selected epistemic state and topology;
- delegated roles and their read/write boundaries;
- writer ownership and worktree/baseline, if any;
- PASS/REVISE/BLOCKED results and revision count;
- human gates requested or passed;
- exact validation evidence and known gaps;
- files changed, including any pre-existing user changes left untouched.
