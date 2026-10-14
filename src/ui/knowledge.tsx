import { useEffect, useRef, useState } from "react";
import { usePluginAction } from "@paperclipai/plugin-sdk/ui";
import type { KnowledgeAnswer } from "../features/knowledge/native.js";
import type { knowledgeSummary } from "../features/knowledge/store.js";

type Index = ReturnType<typeof knowledgeSummary>;
type Entry = { workspaceId: string; revision: string; storedAt: string; expiresAt: string };
export function KnowledgePanel({ entityType, entityId, enabled, ready, refreshEvidence }: { entityType: "project" | "issue"; entityId: string; enabled: boolean; ready: boolean; refreshEvidence: () => unknown }) {
  const invoke = usePluginAction("manage-project-knowledge");
  const [index, setIndex] = useState<Index | null>(null), [entries, setEntries] = useState<Entry[]>([]);
  const [files, setFiles] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("What does this project do?"), [answer, setAnswer] = useState<KnowledgeAnswer | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("Refresh index status to begin."), [busy, setBusy] = useState(false);
  const generation = useRef(0), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; generation.current++; }; }, []);
  async function act(operation: string, extra: Record<string, unknown> = {}) {
    const ticket = ++generation.current; setBusy(true); setError(null);
    if (["query", "ingest", "delete", "status"].includes(operation)) setAnswer(null);
    try {
      const value = await invoke({ entityType, entityId, operation, ...extra }) as {
        enabled?: boolean; index?: Index | null; indexes?: Entry[]; files?: string[]; truncated?: boolean;
        answer?: KnowledgeAnswer; freshness?: { status: string; changed: string[] }; deleted?: boolean; notice?: string;
      };
      if (!live.current || ticket !== generation.current) return;
      if (value.index !== undefined) { setIndex(value.index); setSelected(value.index?.files.map(file => file.path) ?? []); }
      if (value.indexes) setEntries(value.indexes);
      if (value.files) { setFiles(value.files); setNotice(value.truncated ? "The eligible file list is partial. No content has been read." : "Choose files, then explicitly index their contents. Up to 64 files, 64 KiB each, 128 KiB total."); }
      else if (value.answer) { setAnswer(value.answer); void refreshEvidence(); setNotice("Answer uses the retained snapshot. Check source freshness separately."); }
      else if (value.freshness) setNotice(`Source freshness: ${value.freshness.status}${value.freshness.changed.length ? ` — ${value.freshness.changed.join(", ")}` : ""}.`);
      else if (value.deleted !== undefined) { setIndex(current => current?.revision === extra.revision ? null : current); setEntries(current => current.filter(item => item.revision !== extra.revision)); setNotice(value.deleted ? "Private index deleted. Refresh status before indexing again." : "Index changed; refresh status before deleting."); }
      else setNotice(value.notice ?? (value.enabled === false ? "Knowledge is disabled. Retained indexes can still be listed and deleted." : value.index ? "Retained snapshot loaded. Source freshness is not checked automatically." : "No index for this workspace. Choose files to start."));
    } catch (caught) {
      if (live.current && ticket === generation.current) setError(caught instanceof Error ? caught.message : "Knowledge operation failed");
    } finally { if (live.current && ticket === generation.current) setBusy(false); }
  }
  return <section aria-label="Project knowledge" style={{ padding: 16, overflowWrap: "anywhere", minWidth: 0, border: "1px solid #555", borderRadius: 10, display: "grid", gap: 10 }}>
    <strong>Ask your project</strong>
    <p>Build a local knowledge snapshot from files you choose. Ask questions and follow source citations. No API key or external AI provider is used.</p>
    <div><button disabled={busy} onClick={() => void act("status")}>Refresh index status</button>{" "}<button disabled={busy || !enabled} onClick={() => void act("discover")}>Choose knowledge files</button>{" "}<button disabled={busy} onClick={() => void act("list")}>Manage retained indexes</button></div>
    <p role="status">{busy ? "Working locally…" : notice}</p>
    {error && <p role="alert">{error}</p>}
    {files.length > 0 && <fieldset disabled={busy || !enabled || !ready}><legend>Files to read and index</legend><div style={{ maxHeight: 200, overflow: "auto" }}>{files.map(path => <label key={path} style={{ display: "block" }}><input type="checkbox" checked={selected.includes(path)} onChange={event => setSelected(current => event.target.checked ? [...current, path] : current.filter(item => item !== path))} /> {path}</label>)}</div><p>{selected.length} files selected. Indexing stores redacted content privately for up to 30 days.</p><button disabled={!selected.length || selected.length > 64} onClick={() => void act("ingest", { paths: selected, revision: index?.revision ?? null })}>{index ? "Replace index with selected files" : "Index selected files"}</button></fieldset>}
    {index && <div><p>{index.files.length} files · {index.chunks} chunks · indexed {new Date(index.generatedAt).toLocaleString()} · expires {new Date(index.expiresAt).toLocaleString()}</p><p>{index.files.reduce((sum, file) => sum + file.redactedCount, 0)} redactions. Citations refer to the indexed snapshot, which may differ from today's files.</p><button disabled={busy || !enabled || !ready} onClick={() => void act("freshness", { revision: index.revision })}>Check source freshness</button><label style={{ display: "block" }}>Question<textarea style={{ width: "100%", boxSizing: "border-box" }} value={question} maxLength={4000} onChange={event => setQuestion(event.target.value)} /></label><button disabled={busy || !enabled || !ready || !question.trim()} onClick={() => void act("query", { revision: index.revision, question })}>Ask indexed files</button></div>}
    {answer && <div aria-label="Knowledge answer"><strong>{answer.status === "answered" ? "Answer draft" : "Insufficient evidence"}</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer.answer}</pre><p>{answer.scope}</p>{answer.citations.map((citation, i) => <details key={`${citation.path}:${i}`}><summary>{citation.path}:{citation.lineStart}–{citation.lineEnd}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{citation.text}</pre><small>Indexed content SHA-256: {citation.indexedDigest}</small></details>)}</div>}
    {entries.length > 0 && <details><summary>Retained indexes ({entries.length})</summary>{entries.map(item => <div key={item.revision}><span>Workspace {item.workspaceId} · expires {new Date(item.expiresAt).toLocaleString()}</span>{" "}<button disabled={busy} onClick={() => void act("delete", { workspaceId: item.workspaceId, revision: item.revision })}>Delete private index</button></div>)}</details>}
  </section>;
}
