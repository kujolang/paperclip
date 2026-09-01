# Session refresh demo

Use this fixture flow in a real Paperclip workspace:

1. Change `session.ts` to rotate the refresh token.
2. Add a failing test that still expects the old token.
3. Generate a Review Pack to see source/test footprint and suggested verification.
4. Capture the failing assertion as Failure Evidence.
5. Request a Context Pack for “fix session token rotation” and confirm source, test, and contract files are selected without reading the whole repository.

