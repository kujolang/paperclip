# Knowledge integration (development)

The unpublished expansion includes **Ask your project** on project and issue pages.
It uses the pinned RAG 1.0.0 snapshot, works offline and needs no provider key.
Full packaged host acceptance is still pending; public npm 0.1.9 does not include it.

1. Select **Refresh index status**, then **Choose knowledge files**. Discovery lists
   eligible names without reading their contents.
2. Check the files you want and select **Index selected files**. This explicitly
   reads and privately retains their redacted contents; the workspace is unchanged.
3. Enter a question and select **Ask indexed files**. Expand citations to see the
   indexed path, lines and excerpt. Answers are retrieval drafts, not truth guarantees.
4. Select **Check source freshness** for an explicit reread of that selected corpus.
   To update it, choose files and select **Replace index with selected files**.
5. Open **Manage retained indexes** to delete a snapshot, including an older
   workspace's index. Listing and deletion remain available when knowledge is disabled.

The company **Project knowledge** switch defaults on; Installed, Essentials, Build
and Full include it. Other profiles disable it. Agents call
`manage-project-knowledge` using host-owned company/project context. Operations are
`discover`, `status`, `list`, `ingest`, `query`, `freshness` and `delete`.
Ingest requires explicit `paths` and `revision` (null for a new index); query and
freshness require the current revision; deletion requires its listed workspace ID
and revision. Caller company IDs, workspace paths and unknown inputs are rejected.
Human UI actions require authenticated company actor context. At most two native
operations run per worker, with shared bounded capture/index/query time budgets.

Query results retain bounded redacted **knowledge-answer** evidence on the current
project or issue. The private native index is never included in that history or its
exports. An answer uses the saved snapshot; it never silently rereads or reindexes
the workspace. No-evidence results remain explicit.

## Native lifecycle

The adapter accepts explicitly admitted text bytes, never a caller workspace path.
It copies the pinned component into a canonical private temporary directory and
runs a fixed Kujo projection with isolated imports and interpreter execution.
Canonical RAG performs parsing, chunking, hash embeddings, local JSON persistence,
hybrid retrieval and answer synthesis. The adapter does not reimplement those
algorithms. It uses canonical defaults directly, without loading dotenv files or
inheriting provider settings, credentials or remote vector configuration.

Ingestion supports visible Markdown, text and Kujo source files: at most 64 files,
64 KiB per file and 128 KiB total. Paths must be safe on every supported platform;
case-insensitive duplicates, hidden directories, vendor dependencies, sensitive
names and unsupported formats are rejected. Redaction occurs before indexing.
PDF extraction, arbitrary parser commands and external providers are not enabled.
Ingestion must report every supplied document loaded, no errors, no abort and at
least one chunk. Exit zero alone does not admit an index. Empty or incomplete
results fail without replacing a previously retained index.

The returned private artifact contains the native index (at most 8 MB), source and
indexed-content digests, redaction counts, line counts, component/bridge identity,
runtime provenance and a namespace derived from company/project/workspace IDs.
It is sensitive internal state, not a public response or downloadable evidence
record. Its checksums detect accidental corruption; they do not authenticate a
caller-supplied artifact. The private store validates identity and integrity. The public service authorizes
every host scope before calling it.

Query reconstructs a fresh private directory from the retained index; it does not
reread project files or reingest them. It verifies the requested namespace, corpus,
index, component and bridge identity. A query returns up to six citations with
path, line range, native score/confidence and both content digests. Citations must
belong to the admitted manifest and fit its redacted snapshot's line counts.
No-evidence and native safe-response results are explicitly insufficient evidence.
Answers are offline retrieval drafts, not an external model's reasoning or proof
of truth. Index bytes never appear in the answer. Temporary data is removed on
success and ordinary errors.

## Private host primitives

Migration `007_knowledge.sql` keeps native index payloads outside exportable evidence
history. There is one index per company/project/workspace and a database-enforced
maximum of twenty rows per company. Random revision tokens provide compare-and-swap
replacement and deletion; stale writers cannot overwrite a concurrent result or
resurrect an index after deletion/recreation. Invalid replacements leave the prior
index intact. Writes use the host's mutation API, with a separate observation read.
If another writer changes the result before observation, refresh without replaying.

Indexes expire thirty days after the last successful replacement. Reads and lists
exclude expired rows; expired bytes are physically purged opportunistically when
that company next creates an index, or through explicit deletion. No periodic
cleanup job is registered yet. Lists fetch only revision, workspace and date
metadata, so older workspace indexes can be discovered for deletion without
loading their corpus. Database integrity is checked before returning private data.

Metadata discovery uses bounded Git-visible file names only. Explicit capture
requires a selected eligible path list, reads each regular file through the
runtime's confined workspace reader, and rejects symlink escapes, binary,
unreadable, oversized or over-budget corpora. It never silently omits a failed
selected file. Explicit freshness inspection rereads only the indexed selection
and compares content digests: changed and unavailable are distinct from current.
A normal query does not perform these rereads.

## Remaining acceptance

The public service checks host entity membership, feature/profile admission,
workspace identity and settings, validates revision ownership, and rechecks native
query/ingest context before publishing results. Its automated service and browser
journeys do not establish full host installation/restart, migrated index recovery,
manual usability, live-provider support or a public release. Those gates remain
open on the expansion tracker.

## Verification

`tests/knowledge-native.spec.ts` exercises real native ingest, serialized-index
restoration, offline query, citations and redaction, namespace and checksum
rejection, component changes, incomplete/empty corpora and no-evidence responses.
Negative output controls reject false-success ingestion and foreign citations.
The ordinary full verification pipeline checks the pinned package and platforms.

`tests/knowledge-store.spec.ts` checks private persistence across recreated worker
contexts, concurrent CAS, company capacity, expiry, corruption and tenant isolation.
`tests/knowledge-admission.spec.ts` checks explicit selection, confined reads and
content freshness. Public service tests exercise the scoped tool journey; a running packaged host is a separate gate.
