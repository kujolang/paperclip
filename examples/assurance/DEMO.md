# Observed native delegation

This diagram uses the real host IDs in [team-proof.json](evidence/team-proof.json).
All four process runs succeeded. Each agent imported its own native RunLedger receipt.

```mermaid
flowchart TD
  A0["lead: 7d612cd0<br/>Issue 3877fe1e<br/>plan-valid"]
  A1["implementation: 199f94fe<br/>Issue 2b935355<br/>passed"]
  A0 -->|native parentId / reportsTo| A1
  A2["testing: ac732a41<br/>Issue 8bd78b36<br/>passed"]
  A0 -->|native parentId / reportsTo| A2
  A3["review: 151e4218<br/>Issue dcf5db0e<br/>passed"]
  A0 -->|native parentId / reportsTo| A3
  A1 --> H[Human evidence review]
  A2 --> H
  A3 --> H
  H --> P[Parent verified complete]
```

![Actual Verification Center](evidence/verification-center.png)

![Actual corrected Lens flow](evidence/corrected-browser.png)

The native issue state remains in_progress. Verified-complete is separate policy metadata, not an override of Paperclip status.
