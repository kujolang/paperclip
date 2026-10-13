These two Kujo fixtures are unmodified copies from Dispatch commit
`ac2609b8ef14cbf8fbec5df5dfc1789fa4fa25b8` (MIT):

- `tests/resume_policy_fixture.kujo`
- `tests/control_boundary_fixtures.kujo`

The integration test copies them into its private pinned source snapshot. It
places the entry fixture at the snapshot root so `--isolated-imports` resolves
canonical `src.*` and `tests.*` modules without consulting the consumer directory.
They are contract tests, not public workflow templates, and are not npm payload.
