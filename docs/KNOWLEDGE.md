# Knowledge integration (development)

The pinned RAG 1.0.0 snapshot and internal native adapter are implemented. The
public Paperclip knowledge panel, agent projection and durable host storage are
not available yet. This document describes the prerequisite and remaining work;
it is not an installation recipe for an available feature.

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
caller-supplied artifact. The future host service must own and authorize storage.

Query reconstructs a fresh private directory from the retained index; it does not
reread project files or reingest them. It verifies the requested namespace, corpus,
index, component and bridge identity. A query returns up to six citations with
path, line range, native score/confidence and both content digests. Citations must
belong to the admitted manifest and fit its redacted snapshot's line counts.
No-evidence and native safe-response results are explicitly insufficient evidence.
Answers are offline retrieval drafts, not an external model's reasoning or proof
of truth. Index bytes never appear in the answer. Temporary data is removed on
success and ordinary errors.

## Required host integration

Before exposing this adapter, implement scoped host authorization and a separate
explicit selection/read boundary. A Context Pack's metadata selection alone must
never authorize reading or indexing content. Review eligible files and corpus
limits before explicit ingestion. Do not silently index a whole workspace.

Persist the private index through company/project/workspace-owned storage with
capacity and retention limits. Support list/status, explicit reindex and delete,
worker restart, concurrent updates, component upgrades and stale corpus evidence.
Freshness must include content changes rather than Git HEAD alone. Preserve the
old index when a replacement fails. Render index coverage, snapshot age, citations,
redaction and insufficient evidence honestly. Querying a retained snapshot must
not silently refresh it or fetch external content.

Add the reviewed Ability projection, feature/profile gates, issue/project UI,
scoped evidence, browser journeys and packaged real-host acceptance. Offline
checks are not live-provider qualification, a public release or newcomer testing.

## Verification

`tests/knowledge-native.spec.ts` exercises real native ingest, serialized-index
restoration, offline query, citations and redaction, namespace and checksum
rejection, component changes, incomplete/empty corpora and no-evidence responses.
Negative output controls reject false-success ingestion and foreign citations.
The ordinary full verification pipeline checks the pinned package and platforms.
