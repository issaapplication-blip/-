# Release Checklist

## Before merge
- [ ] Confirm target repository and base branch.
- [ ] Confirm PR scope matches one approved task.
- [ ] Review changed files and dependency changes.
- [ ] Run formatting, static checks, unit tests, and build.
- [ ] Run integration/E2E checks where available.
- [ ] Check secrets, logs, permissions, input validation, and rate limits.
- [ ] Check mobile layout, keyboard accessibility, and Arabic RTL/localization where applicable.
- [ ] Confirm data migrations are backward-compatible and separately approved.
- [ ] Document environment variables without including their values.
- [ ] Add rollback instructions and release notes.

## Merge
- [ ] Required CI checks are green.
- [ ] No unresolved blocking review comments.
- [ ] Merge strategy is appropriate and branch is not behind unexpectedly.

## Production release (separate approval)
- [ ] Explicit owner approval recorded.
- [ ] Backup/restore path verified if data changes are involved.
- [ ] Deployment target and commit SHA confirmed.
- [ ] No live customer messaging during smoke tests.
- [ ] Health check and critical user journeys verified.
- [ ] Monitor errors and define rollback trigger.

## After release
- [ ] Record deployed commit and time.
- [ ] Confirm expected behavior without exposing personal data.
- [ ] Close or update the PR and project decision log.
