# Codex Task Quality Gate

Use this skill as the quality gate for future Codex development tasks in this repository.

## PR mode must be explicit

- Start every Codex task by stating whether the work updates an existing PR or creates a new PR.
- Do not keep modifying a merged PR. If the prior PR has been merged, create a fresh task and a fresh PR.

## Required analysis before implementation

Do not fix only the first visible error. Before coding, document or reason through:

1. Current symptom and user-facing impact.
2. Facts already verified by commands, files, or prior local validation.
3. Plausible root causes and how to distinguish them.
4. Forbidden approaches and approaches that already failed.
5. Recommended implementation path.
6. Acceptance criteria and final verification commands.

## Environment differences to consider

Every implementation must account for differences between:

- Windows PowerShell local runs.
- Local real media files such as `assets/raw/main.mp4` and `captions/main.srt`.
- Codex cloud environments that may not have private media files.
- GitHub PR review and CI environments.

If a command cannot fully run in Codex because real media is unavailable, report that clearly instead of hiding the limitation.

## Do not repeat failed approaches

- If a solution category has already failed, do not retry the same category under a slightly different name.
- Record the known failure and choose a different approach.

## Test integrity

- Do not write fake commands, fake tests, or scripts that hide failed work.
- Do not swallow errors only to make a check pass.
- Warnings are allowed only when they are honest environment limitations and the user has enough detail to continue locally.

## Scope control

- Do not do unrelated refactors.
- Do not do unrelated visual changes.
- Do not change validated paths unless the task explicitly requires it.
- Do not move or rename real asset paths without explicit user approval.

## Error messages and post-checks

- Provide clear error messages that explain what file, command, or input is missing.
- Add post-build or post-feature checks when the feature creates files or updates important state.
- Checks should detect accidental fallback to demo placeholders when real mode is expected.

## Documentation requirement

Every feature must update either `README.md` or the PR description with usage instructions. Prefer updating `README.md` for user-facing commands.

## Final acceptance commands

Every feature must list the final local acceptance commands. For this project, include Windows PowerShell-compatible npm commands when relevant.

## Merge standard

Before marking a PR ready to merge, the PR must clearly state:

- What changed.
- How it was tested.
- What could not be tested in Codex and why.
- How a Windows user with local real media can validate it.
- Any known limitations or unsupported inputs.
