# Demo Scenarios

This file provides practical scenarios you can use in demos, videos, or onboarding sessions.

## Scenario 1: Documentation Assistant

Objective:
- Help an agent understand project docs quickly.

Flow:
1. List tools.
2. Read README and guide docs.
3. Run content search for a concept.
4. Generate a summary for handoff.

Tools:
- read_project_docs
- search_files
- generate_summary

## Scenario 2: Safe Patch Workflow

Objective:
- Show controlled write behavior in an approved sandbox.

Flow:
1. Write a patch under patches/.
2. Read back line ranges for verification.
3. Attempt out-of-scope write and confirm rejection.

Tools:
- write_safe_patch
- read_text_range

## Scenario 3: Codebase Discovery

Objective:
- Show fast structured inspection for agent planning.

Flow:
1. List tree recursively under docs and patches.
2. Grep for a keyword in literal mode.
3. Grep in regex mode for broader matching.

Tools:
- list_tree_recursive
- grep_text

## Scenario 4: Resource-Driven Bootstrap

Objective:
- Bootstrap agent context from resources without direct file paths.

Flow:
1. List resources.
2. Read project://docs.
3. Read files://tree to map workspace roots.
4. Read log://calls to inspect operation history.

Resources:
- project://docs
- files://tree
- log://calls

## Scenario 5: Request Guardrail Behavior

Objective:
- Demonstrate resilient endpoint behavior under bad input.

Flow:
1. Send malformed or invalid tool arguments.
2. Validate deterministic error response.
3. Observe logs for rejected operation traces.

Outcome:
- Demonstrates production-facing guardrails and predictable failures.
