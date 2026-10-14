# Review boundary and release dependencies

Status checked 2026-10-14. No expansion release is authorized by this handoff.
The user requested completion of knowledge and release-readiness checks, then a
stop for review. The remaining ecosystem roadmap is deferred, not completed.

## Required plugin release

`@kujolang/paperclip` needs a new reviewed release to deliver these changes to npm
users. Public 0.1.9 is the maintenance release. Do not overwrite it, move its tag,
or publish the development tree as 0.1.9. Choose the next version after review.

The package contains fifteen pinned canonical component snapshots. It does not
resolve those components from the user's separately installed CLI tools. Updating
a standalone tool therefore neither updates nor substitutes the plugin's snapshot.
The runtime dependency is pinned to published `@kujolang/kujo-runtime` 1.8.1;
Node >=24.11.0 and Paperclip's plugin database/action capabilities are required.
The development SDK dependency is 2026.1012.0. SDK matrix tests are not equivalent
to fresh installations of every Paperclip host release.

## Standalone ecosystem release reconciliation

GitHub latest non-prerelease tags were compared with the plugin's exact source
pins through the GitHub compare API. “Behind” means the official release does not
include the pinned source. These repositories need release review if standalone
upgrades should provide the same repairs/functionality. It does not mean every
change since the tag was authored in this session or that current main is ready
to publish. New version numbers remain a maintainer decision.

| Repository | Latest official release | Plugin source pin | Release contains pin? |
| --- | --- | --- | --- |
| [changebucket](https://github.com/kujolang/changebucket) | [v1.1.0](https://github.com/kujolang/changebucket/releases/tag/v1.1.0) | [030eea63c604](https://github.com/kujolang/changebucket/commit/030eea63c60449f82c9ba2680227485d318fdb6d) | Yes |
| [patchbrief](https://github.com/kujolang/patchbrief) | [v1.0.1](https://github.com/kujolang/patchbrief/releases/tag/v1.0.1) | [0e8d6bd6fd22](https://github.com/kujolang/patchbrief/commit/0e8d6bd6fd226b09b807f8758ade08096c8b70f0) | No — release behind snapshot |
| [casefile](https://github.com/kujolang/casefile) | [v1.0.0](https://github.com/kujolang/casefile/releases/tag/v1.0.0) | [d8146a3f62ae](https://github.com/kujolang/casefile/commit/d8146a3f62aee11c52dcfee82381bf22fd0992b2) | No — release behind snapshot |
| [scent](https://github.com/kujolang/scent) | [v1.0.0](https://github.com/kujolang/scent/releases/tag/v1.0.0) | [9c1fcb238221](https://github.com/kujolang/scent/commit/9c1fcb238221dc8a63da3ea1260230aa2f8be766) | No — release behind snapshot |
| [scout](https://github.com/kujolang/scout) | [v1.1.0](https://github.com/kujolang/scout/releases/tag/v1.1.0) | [f3a874fa0e95](https://github.com/kujolang/scout/commit/f3a874fa0e95e26c52ef9ec4d23b0f52d8372089) | Yes |
| [spec](https://github.com/kujolang/spec) | [v1.0.1](https://github.com/kujolang/spec/releases/tag/v1.0.1) | [1211f37a0931](https://github.com/kujolang/spec/commit/1211f37a09314be7150734bf15a55e9b2ea6504d) | No — release behind snapshot |
| [fence](https://github.com/kujolang/fence) | [v1.0.0](https://github.com/kujolang/fence/releases/tag/v1.0.0) | [818fad467674](https://github.com/kujolang/fence/commit/818fad467674efeb6d6b5973211834d3f1a0b1fd) | No — release behind snapshot |
| [concord](https://github.com/kujolang/concord) | [v1.0.0](https://github.com/kujolang/concord/releases/tag/v1.0.0) | [767b28dec553](https://github.com/kujolang/concord/commit/767b28dec5532639c01259eb47d1b19af995e552) | No — release behind snapshot |
| [shipcheck](https://github.com/kujolang/shipcheck) | [v1.0.0](https://github.com/kujolang/shipcheck/releases/tag/v1.0.0) | [0a9f5795e949](https://github.com/kujolang/shipcheck/commit/0a9f5795e9498f3698d5da6bb66642544251dd37) | No — release behind snapshot |
| [eval](https://github.com/kujolang/eval) | [v1.0.0](https://github.com/kujolang/eval/releases/tag/v1.0.0) | [b4a104f3d5e6](https://github.com/kujolang/eval/commit/b4a104f3d5e6464b0335fb07f533e24c8164965b) | No — release behind snapshot |
| [kennel](https://github.com/kujolang/kennel) | [v1.1.1](https://github.com/kujolang/kennel/releases/tag/v1.1.1) | [ebe7094c32b5](https://github.com/kujolang/kennel/commit/ebe7094c32b58f6a92f7ce127ac5cb5ba4c1acc6) | No — release behind snapshot |
| [crud-api](https://github.com/kujolang/crud-api) | [v1.0.0](https://github.com/kujolang/crud-api/releases/tag/v1.0.0) | [7ae446671b27](https://github.com/kujolang/crud-api/commit/7ae446671b27128468ea0cc14c68f4e2ca11a989) | No — release behind snapshot |
| [mcp](https://github.com/kujolang/mcp) | [v1.3.1](https://github.com/kujolang/mcp/releases/tag/v1.3.1) | [922ae7953799](https://github.com/kujolang/mcp/commit/922ae79537991a382ad87c13c49130390813b4fa) | No — release behind snapshot |
| [dispatch](https://github.com/kujolang/dispatch) | [v1.3.0](https://github.com/kujolang/dispatch/releases/tag/v1.3.0) | [4c4d34b2979f](https://github.com/kujolang/dispatch/commit/4c4d34b2979f6754a97a48d1da62e28fda14315d) | No — release behind snapshot |
| [rag](https://github.com/kujolang/rag) | [v1.0.0](https://github.com/kujolang/rag/releases/tag/v1.0.0) | [85743f88c152](https://github.com/kujolang/rag/commit/85743f88c152d7c65f59d4697111faf85e36d8eb) | No — release behind snapshot |

ChangeBucket and Scout already have official releases containing their bundled
pins. The other thirteen rows require reconciliation before claiming equivalent
standalone release behavior. A tool release alone does not change the plugin:
any repin must update bundle hashes and rerun native/platform qualification.

Commerce is not bundled by this knowledge milestone. Its original maintenance
publication is available as `@kujolang/commerce@0.5.0`; integrating its additional
features into Paperclip remains deferred. Starred Issues 0.1.2 and Goal Issues
0.1.1 remain independent plugins. These registry versions were checked directly
on 2026-10-14.

## Review and eventual upgrade order

1. Review PR73 and the merged Paperclip expansion changes; decide the release scope.
2. Review each standalone repository's changes since its release. Release approved
   repairs with the repository's own checks, versioning, artifacts and changelog.
3. If plugin pins change, regenerate/verify the bundle and repeat affected acceptance.
4. Qualify the intended Paperclip host version and Node/runtime combination with
   the final plugin tarball, including database upgrade and restart behavior.
5. Publish the approved plugin version and verify a fresh registry installation.
6. Confirm the first-use experience manually. Automated browser flows cannot stand
   in for feedback from unfamiliar users.

## Acceptance evidence

PR73 holds the knowledge implementation and its automated qualification. Local
verification passed 309 tests (2 skipped), all 58 browser scenarios, typecheck,
build, component integrity, supply-chain and package checks. Local browser tests
used installed Chrome because Playwright's Chromium download timed out; hosted
Chromium remains a separate gate. Packaged host and final-head hosted results
must be recorded before this handoff is called ready. Official minimum/latest
host releases are not yet qualified: the real-host proof uses the prepared
`robertdevore/paperclip` checkout edc9bbb. Identify an upstream release containing
its required APIs, or review/release the relevant fork changes, before advertising
a general upgrade path. The normal local Paperclip
instance has not been modified by these isolated acceptance runs.
