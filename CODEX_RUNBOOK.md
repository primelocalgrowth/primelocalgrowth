# Prime Local Growth operations runbook

## One-command closeout

```powershell
npm run security:closeout
```

This checks CLI readiness, local Apps Script mappings, backend contracts, integration tests, and the production build. For live webhook verification, run the personal operator script with `-Live` after loading keyed URLs into the process environment.

## Tool routing

| Task | Preferred path | Fallback |
| --- | --- | --- |
| Apps Script pull/push/deploy | `clasp` and the clasp MCP server | Chrome Apps Script editor |
| Vercel project/env/deploy | Vercel CLI | Vercel dashboard in Chrome |
| Beehiiv subscriber lookup/delete | PLG Beehiiv helper | Beehiiv dashboard in Chrome |
| Outreach Worker secrets/deploy | Wrangler | Cloudflare dashboard in Chrome |
| Repository and CI | GitHub CLI | GitHub in Chrome |

## Apps Script local mirrors

Local mirrors live under `ops/apps-script/` and are intentionally ignored because they include account-specific mappings. The personal skill `plg-security-operator` contains the authoritative script and deployment map plus the deployment helper.

After Google OAuth is valid:

```powershell
clasp pull
```

Run that command once in each project directory. Inspect all pulled files before any push. Use the skill's deployment script in dry-run mode first.

## Vercel account safety

Run `vercel whoami` and `vercel teams ls` before linking. The live project must already be visible in the selected scope. If `vercel link` proposes creating a project, cancel; that indicates an account/team mismatch.

## Secret handling

- Use provider secret prompts or environment variables.
- Do not print full webhook URLs containing `?key=`.
- Do not store `.clasprc.json`, provider tokens, or webhook keys in this repository.

## Release evidence

Close each security change with:

- Changed
- Verified
- Uncertain
- Next
- Status

## CI boundary

GitHub Actions runs the repository verification suite on pull requests and pushes to `main`. Apps Script deployment remains manual and local because its project code and account mappings are intentionally excluded from source control.
