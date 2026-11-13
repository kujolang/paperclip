# Searchable task list: real Paperclip assurance demo

This is a deterministic integration demonstration, not an LLM benchmark. Four
real Paperclip process-adapter agents use authenticated tools themselves. The
board harness provisions the native agent hierarchy and approves native human
cards. The lead agent creates and assigns the three native child issues itself. The implementation agent writes a searchable HTML task list; Workcell
checks that source, Lens types into the running page and asserts filtering, and
an independent review agent runs native Eval. Each process agent records its actual native outcome through the RunLedger CLI
and imports that receipt under its authenticated host identity. Parent acceptance reads child-owned
results and requires a separate human evidence review. Failed browser attempts
remain alongside the corrected pass. Additional failed/corrected RunLedger correlation is demonstrated
in [the retained producer/host scenario](../accountability-evidence/README.md).

## Requirements and configuration

Use Node satisfying package.json, Git, the installed official Paperclip server,
a supported bundled Kujo runtime, local Docker and a preinstalled immutable image
with `sh`, `grep`, `cp`, and `sleep`. Set KUJO_TEST_RUNLEDGER_ROOT to a reviewed
RunLedger checkout (defaults to the sibling ../runledger); the demo invokes its real CLI. The image must be usable by the host UID.
The demo uses `kujolang/workcell-base:local`, built from Workcell's reviewed source.
Use an explicit Unix endpoint; no image is pulled or Docker context changed by
these scripts. On macOS, place TMPDIR under a directory shared with the VM.

Install optional Lens dependencies and its matching browser:

```sh
npm ci --ignore-scripts
PLAYWRIGHT_SKIP_BROWSER_GC=1 node node_modules/playwright-core/cli.js install chromium --only-shell
npm run build
```

The developer UI suite uses its own Playwright version. If installing its browser
as well, set `PLAYWRIGHT_SKIP_BROWSER_GC=1` on both installation commands so neither
version removes the other version’s required executable.

Enable only selected integrations in company settings:

```json
{
  "features": {"assurance": true, "verification": true, "execution": true},
  "assurance": {"lens": true, "muzzle": true, "workcell": true, "packwrite": true,
    "dockerHost": "unix:///ABSOLUTE/LOCAL/docker.sock"},
  "acceptancePolicies": [{"projectId": "HOST_PROJECT_ID", "mode": "human-approval",
    "allowWaiver": false, "observeHandoffs": true,
    "checks": [{"kind": "lens", "suite": "browser.json"}]}]
}
```

Configure the native `workflow-state` local-folder slot to an operator-owned,
private writable directory. Accept the plugin's declared orchestration/event
capabilities at installation. No existing production host is used by this test.

```sh
KUJO_TEST_DOCKER_HOST=unix:///ABSOLUTE/LOCAL/docker.sock \
  node scripts/acceptance/assurance-native.mjs

TMPDIR=/ABSOLUTE/SHARED/PRIVATE/TEMP \
KUJO_ACCEPTANCE_NPM_HOST=/ABSOLUTE/ISOLATED/HOST/PREFIX \
KUJO_ACCEPTANCE_PRODUCTION=1 KUJO_ACCEPTANCE_PACK=assurance \
KUJO_TEST_DOCKER_HOST=unix:///ABSOLUTE/LOCAL/docker.sock \
  node scripts/acceptance/execution-host.mjs
```

The host prefix must contain the official `@paperclipai/server` package with a
working embedded PostgreSQL binary. The harness creates a fresh account/database,
binds loopback, installs this actual worker, and stops its own host afterward.
It writes result.json, assurance.json, assurance-team.json and a real
verification-center.png under the printed private evidence directory. Context/key
files there are credentials: **never publish the raw directory**. The checked-in
proof is a selected sanitized export. No provider account or model token is needed. RunLedger requires a model string;
the deterministic agents explicitly record `not-applicable-no-model` and leave
token/cost usage absent. This is not an invented model benchmark.

## Walkthrough

1. Inspect the pack under agent/. PackWrite validates six phases; planning text
   grants no execution or delegation authority. A supplied `{files:[{path,content}]}`
   manifest can also compile a private reviewable pack.
2. Request a named native check and inspect the full preview. Starting before
   approval is rejected. Resolve the issue's human-only card, then queue.
3. Inspect Muzzle logs and Workcell receipts/artifacts. Contained Muzzle uses a
   Workcell definition with command `["sh","/workspace/.muzzle/workflows/check.sh"]`.
4. The first Lens flow fails because the search input is absent. The next flow
   visits, types “Verify”, checks hidden/visible results and captures real pixels.
5. Changing input makes the prior acceptance stale. An explicit demo waiver
   remains labelled waived, not verified complete.
6. The four-agent scenario validates native attribution and descendant evidence.
   The board reviews the exact passing source/evidence digest before parent acceptance.
7. Restart the complete host/database and inspect retained results without reruns.

Native scripts also exercise controlled Workcell timeout, process cancellation,
repeatable ownership cleanup and supplied PackWrite compilation. Screenshots show
the real issue surface; diagrams in the engineering audit describe data flow.

No automatic command retry, remote sandbox, provider-generated plan, captured
prompt, invented cost, permanent archival retention or native issue-status override
is claimed. Read [security and storage limits](../../docs/ACCOUNTABILITY.md) first.

See [the observed delegation and screenshots](DEMO.md), [packaged-host proof](evidence/host-proof.json), [team proof](evidence/team-proof.json), and [failed/corrected workflow proof](evidence/workflow-proof.json).
