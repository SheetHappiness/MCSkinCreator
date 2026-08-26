from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPOSITORY_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_DIR))

from run_loop import (  # noqa: E402
    GitClient,
    LoopOptions,
    TASKS,
    launch_codex,
    run_loop,
)


INITIAL_STATE = {
    "schemaVersion": 1,
    "roadmap": "roadmap-2-mcskin3d-parity",
    "nextTaskIndex": 0,
    "status": "ready",
    "lastSuccessfulTask": None,
    "lastSuccessfulCommit": None,
    "activeTask": None,
    "activeBaseline": None,
    "completedTasks": [],
}


class FakeGit:
    def __init__(self, *, branch: str = "main", status: str = "", head: str = "a" * 40):
        self.current_branch = branch
        self.current_status = status
        self.current_head = head
        self.calls: list[str] = []

    def branch(self) -> str:
        self.calls.append("branch")
        return self.current_branch

    def status(self) -> str:
        self.calls.append("status")
        return self.current_status

    def head(self) -> str:
        self.calls.append("head")
        return self.current_head


class FakeCodex:
    def __init__(self, action=None, exit_code: int = 0):
        self.action = action
        self.exit_code = exit_code
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> int:
        self.prompts.append(prompt)
        if self.action is not None:
            self.action()
        return self.exit_code


class RunLoopTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repository_dir = Path(self.temp_dir.name) / "repository"
        self.automation_dir = self.repository_dir / "automation"
        (self.automation_dir / "prompts").mkdir(parents=True)
        self.write_state(INITIAL_STATE)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_state(self, state: dict) -> None:
        self.repository_dir.mkdir(parents=True, exist_ok=True)
        (self.automation_dir / "state.json").write_text(
            json.dumps(state, indent=2) + "\n", encoding="utf-8"
        )

    def read_state(self) -> dict:
        return json.loads((self.automation_dir / "state.json").read_text(encoding="utf-8"))

    def write_prompt(self, index: int, content: str | None = None) -> str:
        task = TASKS[index]
        prompt = content if content is not None else f"Execute {task.task_id} exactly.\n"
        (self.automation_dir / "prompts" / task.prompt_file).write_text(prompt, encoding="utf-8")
        return prompt

    def execute(self, git: FakeGit, codex: FakeCodex, **option_overrides) -> tuple[int, list[str]]:
        output: list[str] = []
        options = LoopOptions(**option_overrides)
        result = run_loop(
            self.automation_dir,
            git,
            codex,
            options,
            output.append,
            validation_launcher=lambda _root: 0,
        )
        return result, output

    def test_clean_main_changed_head_advances_and_passes_prompt_verbatim(self) -> None:
        prompt = self.write_prompt(0, "line one\nline two\n")
        git = FakeGit()
        codex = FakeCodex(lambda: setattr(git, "current_head", "b" * 40))

        result, _ = self.execute(git, codex)

        self.assertEqual(result, 0)
        self.assertEqual(codex.prompts, [prompt])
        state = self.read_state()
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["nextTaskIndex"], 1)
        self.assertEqual(state["lastSuccessfulTask"], "P00")
        self.assertEqual(state["lastSuccessfulCommit"], "b" * 40)
        self.assertEqual(state["completedTasks"], ["P00"])
        self.assertIsNone(state["activeTask"])
        self.assertIsNone(state["activeBaseline"])

    def test_dirty_worktree_refuses_before_launch_without_state_mutation(self) -> None:
        self.write_prompt(0)
        before = (self.automation_dir / "state.json").read_bytes()
        git = FakeGit(status=" M src/editor.ts")
        codex = FakeCodex()

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(codex.prompts, [])
        self.assertEqual((self.automation_dir / "state.json").read_bytes(), before)
        self.assertTrue(any("clean" in line.lower() for line in output))

    def test_wrong_branch_refuses_before_launch(self) -> None:
        self.write_prompt(0)
        git = FakeGit(branch="feature/unsafe")
        codex = FakeCodex()

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(codex.prompts, [])
        self.assertEqual(self.read_state(), INITIAL_STATE)
        self.assertTrue(any("main" in line for line in output))

    def test_placeholder_prompt_is_refused(self) -> None:
        self.write_prompt(0, "AUTOMATION_PROMPT_NOT_READY\nTODO: author this prompt.\n")
        git = FakeGit()
        codex = FakeCodex()

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(codex.prompts, [])
        self.assertEqual(self.read_state(), INITIAL_STATE)
        self.assertTrue(any("placeholder" in line.lower() for line in output))

    def test_missing_and_empty_prompts_are_refused(self) -> None:
        for prompt_content in (None, "   \n"):
            with self.subTest(prompt_content=prompt_content):
                prompt_path = self.automation_dir / "prompts" / TASKS[0].prompt_file
                if prompt_path.exists():
                    prompt_path.unlink()
                if prompt_content is not None:
                    prompt_path.write_text(prompt_content, encoding="utf-8")
                codex = FakeCodex()

                result, _ = self.execute(FakeGit(), codex)

                self.assertEqual(result, 1)
                self.assertEqual(codex.prompts, [])
                self.assertEqual(self.read_state(), INITIAL_STATE)

    def test_same_head_after_codex_stops_with_evidence(self) -> None:
        self.write_prompt(0)
        git = FakeGit()
        codex = FakeCodex()

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        state = self.read_state()
        self.assertEqual(state["status"], "stopped")
        self.assertEqual(state["activeTask"], "P00")
        self.assertEqual(state["activeBaseline"], "a" * 40)
        report = "\n".join(output)
        self.assertIn("P00", report)
        self.assertIn("a" * 40, report)
        self.assertIn("HEAD did not change", report)

    def test_dirty_after_codex_stops(self) -> None:
        self.write_prompt(0)
        git = FakeGit()

        def dirty_after_launch() -> None:
            git.current_head = "b" * 40
            git.current_status = "M  src/editor.ts"

        result, output = self.execute(git, FakeCodex(dirty_after_launch))

        self.assertEqual(result, 1)
        self.assertEqual(self.read_state()["status"], "stopped")
        report = "\n".join(output)
        self.assertIn("M  src/editor.ts", report)
        self.assertIn("not clean", report)

    def test_nonzero_codex_exit_stops_even_when_git_gate_otherwise_passes(self) -> None:
        self.write_prompt(0)
        git = FakeGit()
        codex = FakeCodex(lambda: setattr(git, "current_head", "b" * 40), exit_code=7)

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(self.read_state()["status"], "stopped")
        self.assertTrue(any("code 7" in line for line in output))

    def test_max_task_limit_runs_sequentially(self) -> None:
        self.write_prompt(0)
        self.write_prompt(1)
        git = FakeGit()
        commits = iter(("b" * 40, "c" * 40))
        codex = FakeCodex(lambda: setattr(git, "current_head", next(commits)))

        result, _ = self.execute(git, codex, max_tasks=2)

        self.assertEqual(result, 0)
        self.assertEqual(len(codex.prompts), 2)
        state = self.read_state()
        self.assertEqual(state["nextTaskIndex"], 2)
        self.assertEqual(state["completedTasks"], ["P00", "P01"])
        self.assertEqual(state["status"], "ready")

    def test_dry_run_validates_without_any_mutation_or_launch(self) -> None:
        self.write_prompt(0)
        before = (self.automation_dir / "state.json").read_bytes()
        git = FakeGit()
        codex = FakeCodex()

        result, output = self.execute(git, codex, dry_run=True)

        self.assertEqual(result, 0)
        self.assertEqual(codex.prompts, [])
        self.assertEqual((self.automation_dir / "state.json").read_bytes(), before)
        self.assertFalse((self.automation_dir / "runs").exists())
        self.assertTrue(any("dry-run" in line.lower() for line in output))

    def test_stopped_state_refuses_normal_run(self) -> None:
        stopped = dict(INITIAL_STATE, status="stopped", activeTask="P00", activeBaseline="a" * 40)
        self.write_state(stopped)
        self.write_prompt(0)
        git = FakeGit()
        codex = FakeCodex()

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(codex.prompts, [])
        self.assertEqual(self.read_state(), stopped)
        self.assertTrue(any("--resume" in line for line in output))

    def test_resume_allows_stopped_state_to_retry_current_index(self) -> None:
        stopped = dict(INITIAL_STATE, status="stopped", activeTask="P00", activeBaseline="9" * 40)
        self.write_state(stopped)
        self.write_prompt(0)
        git = FakeGit()
        codex = FakeCodex(lambda: setattr(git, "current_head", "b" * 40))

        result, _ = self.execute(git, codex, resume=True)

        self.assertEqual(result, 0)
        self.assertEqual(self.read_state()["nextTaskIndex"], 1)

    def test_final_p11_sets_complete_and_index_twelve(self) -> None:
        state = dict(INITIAL_STATE)
        state.update(
            nextTaskIndex=11,
            lastSuccessfulTask="P10",
            lastSuccessfulCommit="a" * 40,
            completedTasks=[f"P{index:02d}" for index in range(11)],
        )
        self.write_state(state)
        self.write_prompt(11)
        git = FakeGit(head="b" * 40)
        codex = FakeCodex(lambda: setattr(git, "current_head", "c" * 40))

        result, _ = self.execute(git, codex)

        self.assertEqual(result, 0)
        final_state = self.read_state()
        self.assertEqual(final_state["status"], "complete")
        self.assertEqual(final_state["nextTaskIndex"], 12)
        self.assertEqual(final_state["lastSuccessfulTask"], "P11")
        self.assertEqual(len(final_state["completedTasks"]), 12)

    def test_complete_state_refuses_even_with_resume(self) -> None:
        complete = dict(INITIAL_STATE, status="complete", nextTaskIndex=12)
        self.write_state(complete)

        result, _ = self.execute(FakeGit(), FakeCodex(), resume=True)

        self.assertEqual(result, 1)
        self.assertEqual(self.read_state(), complete)

    def test_independent_validation_requires_validate_script(self) -> None:
        state = dict(INITIAL_STATE, independentValidation=True)
        self.write_state(state)
        self.write_prompt(0)
        git = FakeGit()
        codex = FakeCodex(lambda: setattr(git, "current_head", "b" * 40))

        result, output = self.execute(git, codex)

        self.assertEqual(result, 1)
        self.assertEqual(self.read_state()["status"], "stopped")
        self.assertTrue(any("no validate script" in line for line in output))

    def test_production_codex_adapter_uses_exact_argument_list_and_shell_false(self) -> None:
        prompt = "first line\nsecond line\n"
        completed = subprocess.CompletedProcess([], 0)
        with patch("run_loop.subprocess.run", return_value=completed) as process:
            result = launch_codex(prompt, Path(self.temp_dir.name))

        self.assertEqual(result, 0)
        process.assert_called_once_with(
            ["codex", "exec", "--sandbox", "workspace-write", prompt],
            cwd=Path(self.temp_dir.name),
            shell=False,
            check=False,
        )

    def test_checked_in_initial_state_is_exact(self) -> None:
        checked_in_state = json.loads((REPOSITORY_DIR / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(checked_in_state, INITIAL_STATE)

    def test_git_client_has_no_automatic_repair_commands(self) -> None:
        commands: list[list[str]] = []

        def command_runner(args, **kwargs):
            commands.append(list(args))
            command = args[1:]
            if command == ["branch", "--show-current"]:
                stdout = "main\n"
            elif command == ["status", "--porcelain=v1"]:
                stdout = ""
            else:
                stdout = "a" * 40 + "\n"
            return subprocess.CompletedProcess(args, 0, stdout=stdout, stderr="")

        client = GitClient(Path(self.temp_dir.name), command_runner=command_runner)
        self.assertEqual(client.branch(), "main")
        self.assertEqual(client.status(), "")
        self.assertEqual(client.head(), "a" * 40)

        allowed = {
            ("git", "branch", "--show-current"),
            ("git", "status", "--porcelain=v1"),
            ("git", "rev-parse", "HEAD"),
        }
        self.assertTrue(commands)
        self.assertTrue(all(tuple(command) in allowed for command in commands))


if __name__ == "__main__":
    unittest.main()
