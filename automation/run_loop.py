#!/usr/bin/env python3
"""Static, mechanical Roadmap 2 runner.

The runner deliberately understands Git state and process exit codes only. It does
not interpret Codex output or attempt to repair a repository after a failed gate.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Protocol, Sequence


ALLOWED_STATUSES = {"ready", "running", "stopped", "complete"}
PLACEHOLDER_MARKERS = ("AUTOMATION_PROMPT_NOT_READY", "TODO")


@dataclass(frozen=True)
class Task:
    task_id: str
    title: str
    prompt_file: str


TASKS: tuple[Task, ...] = (
    Task("P00", "3D Picking Foundation", "P00-3d-picking.md"),
    Task("P01", "Direct 3D Painting", "P01-direct-3d-painting.md"),
    Task("P02", "Body Parts + Layer Visibility", "P02-body-parts-layers.md"),
    Task("P03", "Primary / Secondary Color", "P03-primary-secondary-color.md"),
    Task("P04", "Advanced Color Controls + Swatches", "P04-color-controls-swatches.md"),
    Task("P05", "Advanced Paint Tools", "P05-advanced-paint-tools.md"),
    Task("P06", "Tool Options System", "P06-tool-options.md"),
    Task("P07", "History Timeline", "P07-history-timeline.md"),
    Task("P08", "New Skin + Drag-and-Drop", "P08-new-skin-drag-drop.md"),
    Task("P09", "Local Skin Library / Multi-document", "P09-local-library-multidocument.md"),
    Task("P10", "Pop-out Preview + Screenshot", "P10-popout-screenshot.md"),
    Task("P11", "MCSkin3D Parity Audit", "P11-parity-audit.md"),
)


class GitAdapter(Protocol):
    def branch(self) -> str: ...

    def status(self) -> str: ...

    def head(self) -> str: ...


CommandRunner = Callable[..., subprocess.CompletedProcess[str]]
CodexLauncher = Callable[[str], int]
ValidationLauncher = Callable[[Path], int]
Output = Callable[[str], None]


@dataclass(frozen=True)
class LoopOptions:
    max_tasks: int = 1
    resume: bool = False
    dry_run: bool = False


class RunnerError(RuntimeError):
    pass


class GitClient:
    """Read-only Git adapter. No repair or mutation methods exist by design."""

    def __init__(self, repository: Path, command_runner: CommandRunner = subprocess.run):
        self.repository = repository
        self.command_runner = command_runner

    def _read(self, arguments: Sequence[str]) -> str:
        result = self.command_runner(
            ["git", *arguments],
            cwd=self.repository,
            shell=False,
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "unknown Git error"
            raise RunnerError(f"git {' '.join(arguments)} failed: {detail}")
        return result.stdout.rstrip("\r\n")

    def branch(self) -> str:
        return self._read(("branch", "--show-current"))

    def status(self) -> str:
        return self._read(("status", "--porcelain=v1"))

    def head(self) -> str:
        return self._read(("rev-parse", "HEAD"))


def launch_codex(prompt: str, repository: Path) -> int:
    """The sole production Codex process adapter."""

    result = subprocess.run(
        ["codex", "exec", "--sandbox", "workspace-write", prompt],
        cwd=repository,
        shell=False,
        check=False,
    )
    return result.returncode


def launch_validation(repository: Path) -> int:
    executable = "npm.cmd" if os.name == "nt" else "npm"
    result = subprocess.run(
        [executable, "run", "validate"],
        cwd=repository,
        shell=False,
        check=False,
    )
    return result.returncode


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RunnerError(f"Missing state file: {path}") from error
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(f"Cannot read state file {path}: {error}") from error
    if not isinstance(value, dict):
        raise RunnerError("State must be a JSON object.")
    return value


def atomic_write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def validate_state(state: dict) -> None:
    required = {
        "schemaVersion",
        "roadmap",
        "nextTaskIndex",
        "status",
        "lastSuccessfulTask",
        "lastSuccessfulCommit",
        "activeTask",
        "activeBaseline",
        "completedTasks",
    }
    unknown = set(state) - required - {"independentValidation"}
    missing = required - set(state)
    if missing:
        raise RunnerError(f"State is missing fields: {', '.join(sorted(missing))}")
    if unknown:
        raise RunnerError(f"State has unknown fields: {', '.join(sorted(unknown))}")
    if state["schemaVersion"] != 1:
        raise RunnerError("Unsupported state schemaVersion; expected 1.")
    if state["roadmap"] != "roadmap-2-mcskin3d-parity":
        raise RunnerError("Unexpected roadmap identifier.")
    if state["status"] not in ALLOWED_STATUSES:
        raise RunnerError(f"Invalid status: {state['status']!r}")
    index = state["nextTaskIndex"]
    if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index <= len(TASKS):
        raise RunnerError(f"nextTaskIndex must be between 0 and {len(TASKS)}.")
    if not isinstance(state["completedTasks"], list):
        raise RunnerError("completedTasks must be an array.")
    expected_completed = [task.task_id for task in TASKS[:index]]
    if state["completedTasks"] != expected_completed:
        raise RunnerError("completedTasks must exactly match the sequential completed prefix.")
    if state["status"] == "complete" and index != len(TASKS):
        raise RunnerError("Complete state requires nextTaskIndex 12.")
    if state["status"] != "complete" and index == len(TASKS):
        raise RunnerError("nextTaskIndex 12 requires complete state.")
    if "independentValidation" in state and not isinstance(state["independentValidation"], bool):
        raise RunnerError("independentValidation must be true or false when present.")


def read_prompt(prompt_path: Path) -> str:
    try:
        prompt = prompt_path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise RunnerError(f"Missing prompt: {prompt_path}") from error
    except OSError as error:
        raise RunnerError(f"Cannot read prompt {prompt_path}: {error}") from error
    if not prompt.strip():
        raise RunnerError(f"Prompt is empty: {prompt_path}")
    found = [marker for marker in PLACEHOLDER_MARKERS if marker in prompt]
    if found:
        raise RunnerError(
            f"Prompt contains placeholder marker(s) {', '.join(found)} and is not runnable: {prompt_path}"
        )
    return prompt


def preflight(git: GitAdapter) -> tuple[str, str, str]:
    branch = git.branch()
    status = git.status()
    baseline = git.head()
    if branch != "main":
        raise RunnerError(f"Preflight requires branch main; current branch is {branch or '<detached>'}.")
    if status:
        raise RunnerError(f"Preflight requires a clean worktree and index. git status:\n{status}")
    return branch, status, baseline


def package_has_validate(repository: Path) -> bool:
    package_path = repository / "package.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(f"Cannot inspect {package_path}: {error}") from error
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and isinstance(scripts.get("validate"), str) and bool(
        scripts["validate"].strip()
    )


def failure_report(
    output: Output,
    task: Task,
    baseline: str,
    current_head: str,
    status: str,
    reasons: list[str],
) -> None:
    output(f"STOPPED task: {task.task_id}")
    output(f"baseline: {baseline}")
    output(f"current HEAD: {current_head}")
    output(f"git status: {status if status else '<clean>'}")
    output(f"reason: {'; '.join(reasons)}")


def write_run_log(automation_dir: Path, task_id: str, started: str, record: dict) -> None:
    stamp = started.replace(":", "").replace("-", "")
    path = automation_dir / "runs" / f"{stamp}-{time.time_ns()}-{task_id}.json"
    atomic_write_json(path, record)


def run_loop(
    automation_dir: Path,
    git: GitAdapter,
    codex_launcher: CodexLauncher,
    options: LoopOptions,
    output: Output = print,
    validation_launcher: ValidationLauncher = launch_validation,
) -> int:
    if options.max_tasks < 1:
        output("ERROR: --max-tasks must be at least 1.")
        return 2

    repository = automation_dir.parent
    state_path = automation_dir / "state.json"
    try:
        state = read_json(state_path)
        validate_state(state)
        if state["status"] == "complete":
            raise RunnerError("Roadmap is complete; no task may be launched.")
        if state["status"] == "stopped" and not options.resume:
            raise RunnerError("Roadmap is stopped; inspect the failure and use --resume to retry.")
        if state["status"] == "running":
            raise RunnerError("Roadmap state is running; resolve the interrupted run before continuing.")

        task = TASKS[state["nextTaskIndex"]]
        prompt_path = automation_dir / "prompts" / task.prompt_file
        _branch, _status, baseline = preflight(git)
        prompt = read_prompt(prompt_path)

        if options.dry_run:
            output(f"DRY-RUN valid: {task.task_id} {task.title}")
            output(f"baseline: {baseline}")
            output(f"prompt: {prompt_path}")
            return 0

        completed_this_run = 0
        while completed_this_run < options.max_tasks:
            task = TASKS[state["nextTaskIndex"]]
            prompt_path = automation_dir / "prompts" / task.prompt_file
            _branch, _status, baseline = preflight(git)
            prompt = read_prompt(prompt_path)
            started = utc_now()
            running_state = dict(state)
            running_state.update(status="running", activeTask=task.task_id, activeBaseline=baseline)
            atomic_write_json(state_path, running_state)

            process_exit: int | None = None
            launch_error: str | None = None
            try:
                process_exit = codex_launcher(prompt)
            except Exception as error:  # process boundary must still produce stopped evidence
                launch_error = f"Codex launch failed: {error}"

            reasons: list[str] = []
            if launch_error is not None:
                reasons.append(launch_error)
            elif process_exit != 0:
                reasons.append(f"Codex process exited with code {process_exit}")
            try:
                current_branch = git.branch()
                current_status = git.status()
                current_head = git.head()
            except Exception as error:
                current_branch = "<unavailable>"
                current_status = "<unavailable>"
                current_head = "<unavailable>"
                reasons.append(f"cannot inspect Git after Codex: {error}")
            else:
                if current_branch != "main":
                    reasons.append(f"current branch is {current_branch or '<detached>'}, expected main")
                if current_status:
                    reasons.append("worktree or index is not clean")
                if current_head == baseline:
                    reasons.append("HEAD did not change")

            mechanical_gate = {
                "branchMain": current_branch == "main",
                "clean": not bool(current_status),
                "headChanged": current_head != baseline,
                "passed": not reasons,
            }
            validation_exit: int | None = None
            if not reasons and state.get("independentValidation", False):
                try:
                    has_validate = package_has_validate(repository)
                    if not has_validate:
                        reasons.append(
                            "independent validation requested but package.json has no validate script"
                        )
                    else:
                        validation_exit = validation_launcher(repository)
                        if validation_exit != 0:
                            reasons.append(f"independent validation exited with code {validation_exit}")
                        else:
                            validation_branch = git.branch()
                            validation_status = git.status()
                            validation_head = git.head()
                            if validation_branch != "main":
                                reasons.append(
                                    "branch changed during independent validation to "
                                    f"{validation_branch or '<detached>'}"
                                )
                            if validation_status:
                                current_status = validation_status
                                reasons.append("independent validation left the worktree or index dirty")
                            if validation_head != current_head:
                                reasons.append("HEAD changed during independent validation")
                except Exception as error:
                    reasons.append(f"independent validation failed to run: {error}")

            ended = utc_now()
            record = {
                "task": task.task_id,
                "start": started,
                "baseline": baseline,
                "end": ended,
                "finalSha": current_head,
                "processExit": process_exit,
                "mechanicalGate": mechanical_gate,
            }
            if validation_exit is not None:
                record["validationExit"] = validation_exit

            if reasons:
                stopped_state = dict(running_state)
                stopped_state["status"] = "stopped"
                atomic_write_json(state_path, stopped_state)
                record["mechanicalGate"]["passed"] = False
                record["reason"] = "; ".join(reasons)
                write_run_log(automation_dir, task.task_id, started, record)
                failure_report(output, task, baseline, current_head, current_status, reasons)
                return 1

            next_index = state["nextTaskIndex"] + 1
            completed = [*state["completedTasks"], task.task_id]
            successful_state = dict(state)
            successful_state.update(
                nextTaskIndex=next_index,
                status="complete" if next_index == len(TASKS) else "ready",
                lastSuccessfulTask=task.task_id,
                lastSuccessfulCommit=current_head,
                activeTask=None,
                activeBaseline=None,
                completedTasks=completed,
            )
            atomic_write_json(state_path, successful_state)
            write_run_log(automation_dir, task.task_id, started, record)
            output(f"SUCCESS {task.task_id}: observed commit {current_head}")
            state = successful_state
            completed_this_run += 1
            if state["status"] == "complete":
                output("Roadmap complete at P11; nextTaskIndex is 12.")
                break

        return 0
    except RunnerError as error:
        output(f"ERROR: {error}")
        return 1


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run static Roadmap 2 Codex prompts mechanically.")
    parser.add_argument("--max-tasks", type=int, default=1)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    automation_dir = Path(__file__).resolve().parent
    repository = automation_dir.parent
    git = GitClient(repository)
    return run_loop(
        automation_dir,
        git,
        lambda prompt: launch_codex(prompt, repository),
        LoopOptions(max_tasks=args.max_tasks, resume=args.resume, dry_run=args.dry_run),
    )


if __name__ == "__main__":
    sys.exit(main())
