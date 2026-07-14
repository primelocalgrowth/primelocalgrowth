# Prime Local Growth agent instructions

## Source of truth

- This repository is the canonical PLG website source.
- Preserve unrelated user changes and inspect `git status` before editing.
- Use `CODEX_RUNBOOK.md` for security deployments and closeout.

## Security invariants

- Never print, commit, or paste secrets into tracked files or command arguments.
- Keep Apps Script `.clasp.json` files and deployment mappings ignored.
- Update existing Apps Script web-app deployments; do not create replacement URLs without an explicit migration plan.
- Verify unkeyed webhook requests fail and keyed requests get past authentication.
- Neutralize spreadsheet-bound text beginning with `=`, `+`, `-`, or `@`.
- Keep Beehiiv publication IDs pinned to the intended property.

## Verification

Run `npm run verify:plg` for repository checks and `npm run security:closeout` for the full local operator preflight plus repository verification.
