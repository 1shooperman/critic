# FAKE_PLAN: Add Release Guardrails to CI

## Goal
Reduce production regressions by adding lightweight release checks that fail fast when core quality gates are not met.

## Scope
- Monorepo with Node.js services and a React frontend.
- Existing CI runs unit tests but does not enforce coverage thresholds, migration checks, or deployment blockers.

## Proposed Plan
1. Add a `release:check` script that runs:
- typecheck
- unit tests
- lint
- build
2. Enforce minimum coverage of 70% globally.
3. Add a migration safety check that ensures down migrations exist for every up migration.
4. Require release notes in PR description for any change touching `src/api/**`.
5. Auto-deploy to production after merge to `main` if checks pass.

## Assumptions
- Current tests are stable and deterministic.
- Coverage is close enough to 70% that this will not block the team for long.
- Rollbacks can be handled manually by on-call.

## Constraints
- Team has 2 engineers available this sprint.
- Deadline is end of week.
- No budget for paid CI tooling.

## Risks Already Noted by Author
- Coverage threshold may initially fail for legacy modules.
- Migration checks may require conventions that are not yet standardized.

## Open Questions
- Should deployment remain automatic for hotfix branches?
- Should we gate by changed-files coverage instead of global coverage?
- How strict should release note validation be?
