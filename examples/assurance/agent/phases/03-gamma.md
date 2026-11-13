# Phase 03: Independent review

## Goal
Run native Eval checks against the current source snapshot. Report check outcomes rather than an opinion of correctness.

## Read before starting
- agent/MASTER.md

## Scope
- Review agent operates only on this disposable local fixture.

## Out of scope
- Production systems, provider credentials and publication.

## Implementation notes
Paperclip owns assignment, parent-child relationships and run identity. Planning text cannot approve execution.

## Acceptance criteria
- [ ] The assigned operation has a retained native result.
- [ ] Failures, missing evidence and stale source are visible.

## Suggested checks
- Review and authorize the exact native operation before running it.

## Handoff requirements
Link the originating issue, run, approval, artifacts and outcome. Update HANDOFF.
