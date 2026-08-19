# Branching & Release Workflow

## Branch roles

| Branch | Role |
|---|---|
| `main` | Production. Vercel auto-deploys this to `cambriancatalyst.ai`. |
| `staging` | Integration testing. **Always ready to flip to main** — nothing lands here that couldn't ship. |
| `dev` | Development integration. Work branches merge here first for initial testing. |
| work branches | Short-lived branches for a single issue (see naming below). |

## Rules

1. **Every branch is backed by a GitHub issue.** Open the issue first; the branch name references it.
2. **Naming scheme:** `xxx/issue-yyy-zzzz`
   - `xxx` — category prefix: `feature`, `bugfix`, `doc`, or another reasonable category of work. Most branches are `feature` or `bugfix`.
   - `yyy` — the number of the GitHub issue backing the branch.
   - `zzzz` — a hyphenated descriptive slug (e.g. `claude-md`, `hubspot-sync`).
   - Examples: `feature/issue-12-hubspot-sync`, `bugfix/issue-17-score-blank`, `doc/issue-1-claude-md`.
3. **All new branches are cut from `staging`.**

## Flow

```
staging ──┬─► xxx/issue-yyy-zzzz ──PR──► dev ──(test in dev)──► PR to staging ──(integration test)──► main
          └────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. Cut a work branch from `staging`.
2. Open a PR from the work branch into `dev`; merge and do initial testing there.
3. Once validated in `dev`, open a PR from the work branch into `staging`.
4. Integration testing happens on `staging` (Vercel preview deployment).
5. When staging is verified, flip to `main` (production). Tag before merging to main; roll back by resetting to the last good tag.
