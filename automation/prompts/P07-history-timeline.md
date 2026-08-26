# P07 — History Timeline

AUTOMATION_PROMPT_NOT_READY

TODO: Replace this placeholder with the reviewed task-specific prompt before the loop is enabled.

Repository:
C:\MinecraftSkinCreator

Branch:
main

Read:

- README.md
- AGENTS.md
- relevant docs
- current task prompt

Before implementation:

- verify branch == main
- record current HEAD as baseline
- verify working tree clean
- verify index clean

Do not:

- create branches
- create worktrees
- reset
- stash
- rewrite history
- discard unrelated files

If preflight fails:
STOP and report.

STOP CONDITIONS

Do not commit and stop if:

- required implementation cannot be completed within task scope;
- prerequisite architecture is missing or inconsistent;
- tests fail for an unexplained reason;
- production build fails;
- repository becomes unexpectedly dirty;
- task requires destructive Git recovery;
- task requires Roadmap 3 functionality;
- implementation would require weakening Electron security;
- a documented architectural contract must be violated.

Do not silently expand scope.
Do not automatically repair unrelated defects.
