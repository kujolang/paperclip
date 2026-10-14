export type PluginDetailTabProps = {
  context: { entityType: string; entityId: string };
};

declare global {
  interface Window {
    __KUJO_KNOWLEDGE__?: any;
    __KUJO_DELAY_KNOWLEDGE__?: boolean;
    __KUJO_RESOLVE_KNOWLEDGE__?: () => void;
    __KUJO_WORKFLOW_REQUESTS__?: Array<Record<string, unknown>>;
    __KUJO_DELAY_WORKFLOW__?: boolean;
    __KUJO_RESOLVE_WORKFLOW__?: () => void;
    __KUJO_DELAY_PACKAGES__?: boolean;
    __KUJO_RESOLVE_PACKAGES__?: () => void;
    __KUJO_DELAY_CREATION__?: boolean;
    __KUJO_RESOLVE_CREATION__?: () => void;
    __KUJO_CREATION_REQUESTS__?: Array<Record<string, unknown>>;
    __KUJO_DELAY_SOURCE__?: boolean;
    __KUJO_RESOLVE_SOURCE__?: () => void;
    __KUJO_SOURCE_REQUESTS__?: Array<Record<string, unknown>>;
    __KUJO_DELAY_EVAL__?: boolean;
    __KUJO_RESOLVE_EVAL__?: () => void;
    __KUJO_EVAL_REQUESTS__?: Array<Record<string, unknown>>;
    __KUJO_NAVIGATE__?: (companyId: string) => void;
    __KUJO_DELAY_SHIPCHECK__?: boolean;
    __KUJO_RESOLVE_SHIPCHECK__?: () => void;
    __KUJO_DELAY_CONCORD__?: boolean;
    __KUJO_RESOLVE_CONCORD__?: () => void;
    __KUJO_DELAY_FENCE__?: boolean;
    __KUJO_RESOLVE_FENCE__?: () => void;
    __KUJO_DELAY_SPEC__?: boolean;
    __KUJO_RESOLVE_SPEC__?: () => void;
    __KUJO_DELAY_FORMAT__?: boolean;
    __KUJO_DELAY_IMPORT__?: boolean;
    __KUJO_RESOLVE_IMPORT__?: () => void;
    __KUJO_DELAY_HISTORY__?: boolean;
    __KUJO_RESOLVE_HISTORY__?: () => void;
    __KUJO_RESOLVE_FORMAT__?: () => void;
    __KUJO_FIXTURE_DATA__?: unknown;
    __KUJO_ACTIONS__?: Array<{ action: string; input: unknown }>;
  }
}

export function StatusBadge({ label, status }: { label: string; status: string }) {
  return <span aria-label={`${label} status`} data-status={status}>{label}</span>;
}

export function Spinner({ label }: { label: string }) {
  return <div role="status">{label}</div>;
}

export function usePluginData<T>() {
  return {
    data: window.__KUJO_FIXTURE_DATA__ as T,
    loading: false,
    error: null,
    refresh: async () => undefined,
  };
}

export function usePluginAction(action: string) {
  return async (input: unknown) => {
    window.__KUJO_ACTIONS__ ??= [];
    window.__KUJO_ACTIONS__.push({ action, input });
    if (action === "manage-project-knowledge") {
      if (window.__KUJO_DELAY_KNOWLEDGE__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_KNOWLEDGE__ = resolve; }); throw new Error("private delayed knowledge result"); }
      const params = input as { operation: string };
      const index = window.__KUJO_KNOWLEDGE__;
      const entries = index ? [{ workspaceId: "workspace", revision: index.revision, storedAt: index.generatedAt, expiresAt: index.expiresAt }] : [];
      if (params.operation === "status" || params.operation === "list") return { enabled: true, index: index ?? null, indexes: entries };
      if (params.operation === "discover") return { files: ["docs/guide.md"], truncated: false };
      if (params.operation === "ingest") {
        window.__KUJO_KNOWLEDGE__ = { revision: "fixture-revision", files: [{ path: "docs/guide.md", redactedCount: 0 }], chunks: 1, generatedAt: "2026-10-13T00:00:00Z", expiresAt: "2026-11-12T00:00:00Z" };
        return { index: window.__KUJO_KNOWLEDGE__, indexes: [{ workspaceId: "workspace", revision: "fixture-revision", expiresAt: "2026-11-12T00:00:00Z" }] };
      }
      if (params.operation === "query") return { answer: { status: "answered", answer: "Kujo runs local programs.", scope: "Offline retrieval draft from the indexed snapshot.", citations: [{ path: "docs/guide.md", lineStart: 1, lineEnd: 2, text: "Kujo runs local programs.", indexedDigest: "a".repeat(64) }] } };
      if (params.operation === "freshness") return { freshness: { status: "changed", changed: ["docs/guide.md"] } };
      if (params.operation === "delete") { window.__KUJO_KNOWLEDGE__ = null; return { deleted: true }; }
    }
    if (action === "preview-starter") {
      if (window.__KUJO_DELAY_PACKAGES__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_PACKAGES__ = resolve; }); throw new Error("private delayed starter result"); }
      if ((input as { kind: string }).kind === "mcp") return { ...(input as object), status: "preview", entrypoint: "server.kujo", runtimeVersion: "1.8.1", provenance: { component: "mcp", version: "1.3.1", commit: "canonical-mcp-commit" }, files: [{ path: "server.kujo", content: "from src.server.runtime import entry_loaded", sha256: "fixture" }], notice: "No server registered or started." };
      if ((input as { kind: string }).kind === "api") return { ...(input as object), status: "preview", entrypoint: "main.kujo", runtimeVersion: "1.8.1", provenance: { component: "crud-api", version: "1.0.0", commit: "canonical-api-commit" }, files: [{ path: "main.kujo", content: "from src.server.runtime import entry_loaded", sha256: "fixture" }], notice: "No server started or database created." };
      return { ...(input as object), status: "preview", runtimeVersion: "1.8.1", files: [{ path: "src/main.kujo", content: 'print("Hello from Kujo")', sha256: "fixture" }], notice: "Generated programs have not run." };
    }
    if (action === "inspect-kujo-packages") {
      if (window.__KUJO_DELAY_PACKAGES__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_PACKAGES__ = resolve; }); throw new Error("private delayed package result"); }
      return { status: "warnings", reportId: "package-fixture" };
    }
    if (action === "manage-kujo-workflow") {
      const params = input as { operation: string; id?: string; template?: string; decision?: string };
      if (window.__KUJO_DELAY_WORKFLOW__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_WORKFLOW__ = resolve; }); throw new Error("private delayed workflow result"); }
      const requests = window.__KUJO_WORKFLOW_REQUESTS__ ??= [];
      if (params.operation === "list") return { requests };
      if (params.operation === "inspect") return { plan: { summary: "Offline workflow with human checkpoints.", preview: "Canonical Dispatch offline approval-handoff", timeoutMs: 120000 } };
      if (params.operation === "prepare" || params.operation === "decide") {
        const item = { id: `workflow_${requests.length}`, parentId: params.operation === "prepare" ? `workflow_${requests.length}` : params.id, name: params.template ?? params.decision, operation: params.operation === "prepare" ? "dispatch.start" : "dispatch.decide",
          state: "pending", queuedAt: null, plan: { summary: "Reviewed workflow" }, result: null };
        requests.push(item); return item;
      }
      if (params.operation === "observe" && requests.find(record => record.id === params.id)?.operation === "dispatch.decide") return { status: "decision-observed", control: null, decisionReceipt: { schema: "kujo.paperclip.dispatch-decision-observation/v1", run_id: "run-fixture", decision_id: "decision", expected_state_revision: 3, observed_state_revision: 8, run_status: "completed", match: "exact", decision_status: "applied" } };
      if (params.operation === "observe") return { status: "observed", control: { schema: "kujo.control-view/v1", available: true, run_id: "run-fixture", state_revision: 3, run_status: "paused", human_intervention: { prompt: "Review fixture checkpoint" }, current_control_boundary: null } };
      const item = requests.find(record => record.id === params.id)!;
      if (params.operation === "start") item.queuedAt = "2026-10-13T20:00:00Z";
      if (params.operation === "cancel") item.state = "cancelled";
      return { ...item };
    }
    if (action === "manage-kujo-starter") {
      const params = input as { operation: string; kind?: string; name?: string; id?: string };
      if (window.__KUJO_DELAY_CREATION__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_CREATION__ = resolve; }); throw new Error("private delayed creation result"); }
      const requests = window.__KUJO_CREATION_REQUESTS__ ??= [];
      if (params.operation === "list") return { requests, history: { pending: false } };
      if (params.operation === "inspect") return { plan: { summary: "New canonical starter files; no overwrite", preview: "src/main.kujo · reviewed digest" }, preview: { kind: params.kind, name: params.name, entrypoint: "src/main.kujo", files: [{ path: "src/main.kujo", content: 'print("Hello from Kujo")' }] } };
      if (params.operation === "prepare") { const item = { id: "creation_fixture", kind: params.kind, name: params.name, state: "pending", plan: { preview: "reviewed inventory" }, result: null }; requests.push(item); return item; }
      const item = requests.find(record => record.id === params.id)!;
      if (params.operation === "start") { item.state = "succeeded"; item.classification = "created"; item.result = { classification: "created", destination: item.name, entrypoint: `${item.name}/src/main.kujo`, files: [{ path: "src/main.kujo" }] }; item.history = { notice: "Creation plan and outcome retained." }; }
      if (params.operation === "cancel") item.state = "cancelled";
      return { ...item };
    }
    if (action === "manage-kujo-execution") {
      const params = input as { operation: string; mode?: string; path?: string; id?: string };
      if (window.__KUJO_DELAY_SOURCE__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_SOURCE__ = resolve; }); throw new Error("private delayed source result"); }
      const requests = window.__KUJO_SOURCE_REQUESTS__ ??= [];
      if (params.operation === "list") return { requests, history: { pending: false } };
      if (params.operation === "inspect") return { plan: { summary: "Fixed native command on frozen inputs", preview: params.mode === "fixtures" ? "kujo test --runtime interpreter" : `kujo ${params.mode} ${params.path}` } };
      if (params.operation === "prepare") { const item = { id: "source_fixture", mode: params.mode, path: params.path ?? "tests/", state: "pending", plan: { preview: "approved source" }, result: null }; requests.push(item); return item; }
      const item = requests.find(record => record.id === params.id)!;
      if (params.operation === "start") { item.state = "succeeded"; item.classification = "process-completed"; item.result = { classification: "process-completed", stdout: "native fixture output", stderr: "", exitCode: 0 }; item.history = { notice: "Plan and outcome retained." }; }
      if (params.operation === "cancel") item.state = "cancelled";
      return { ...item };
    }
    if (action === "manage-evaluation") {
      const params = input as { operation: string; suite?: string; id?: string };
      if (window.__KUJO_DELAY_EVAL__) { await new Promise<void>(resolve => { window.__KUJO_RESOLVE_EVAL__ = resolve; }); throw new Error("private delayed Eval result"); }
      const requests = window.__KUJO_EVAL_REQUESTS__ ??= [];
      if (params.operation === "list") return { requests, history: { pending: new URLSearchParams(location.search).get("historyPending") === "1" } };
      if (params.operation === "inspect") return { plan: { preview: "json_value_equals", effects: ["execute_project", "network"] }, coverage: { complete: false, notice: "Dependencies are not frozen" } };
      if (params.operation === "prepare") { const item = { id: "execution_fixture", suite: params.suite, state: "pending", plan: { preview: "json_value_equals" }, result: null }; requests.push(item); return item; }
      const item = requests.find(record => record.id === params.id)!;
      if (params.operation === "start") { item.state = "succeeded"; item.classification = "partial"; item.result = { classification: "partial", nativeClassification: "passed" }; item.abilityReceipt = { status: "succeeded" }; }
      if (params.operation === "cancel") item.state = "cancelled";
      return { ...item };
    }
    if (action === "preview-kujo-format" && window.__KUJO_DELAY_FORMAT__) await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_FORMAT__ = resolve; });
    if (action === "preview-kujo-format") return { path: "src/main.kujo", changed: true, source: "answer:=40+2\nprint(answer)", formatted: "answer := 40 + 2", redactedCount: 0, stale: false };
    if (action === "inspect-evidence" && window.__KUJO_DELAY_HISTORY__) await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_HISTORY__ = resolve; });
    if (action === "inspect-evidence" || action === "export-evidence") return { receipt: { id: "before" }, payload: { check: "passed", scope: "Source checks only" }, exportDigest: "safe-export-digest" };
    if (action === "compare-evidence") return { sameInputs: null, samePayload: false, left: { check: "passed" }, right: { check: "failed" } };
    if (action === "attach-evidence") return { status: "attached", documentId: "document" };
    if (action === "import-verification") {
      if (window.__KUJO_DELAY_IMPORT__) await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_IMPORT__ = resolve; });
      return { classification: "partial", result: { evaluator: { name: "eval", version: "2.0.0" }, checks: { passed: 3, failed: 0, warned: 0, skipped: 1 }, verdict: "pass", subject: { run_id: "supplied-run" }, finished_at: "2026-10-12T00:00:00Z" }, generatedAt: "2026-10-12T01:00:00Z", referenceCount: 2 };
    }
    if (action === "inspect-release-readiness") {
      if (window.__KUJO_DELAY_SHIPCHECK__) { await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_SHIPCHECK__ = resolve; }); throw new Error("private delayed readiness error"); }
      return { status: "partial", reportId: "fixture-shipcheck" };
    }
    if (action === "inspect-artifact-drift") {
      if (window.__KUJO_DELAY_CONCORD__) { await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_CONCORD__ = resolve; }); throw new Error("private delayed artifact drift error"); }
      return { status: "partial", reportId: "fixture-concord" };
    }
    if (action === "inspect-architecture") {
      if (window.__KUJO_DELAY_FENCE__) { await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_FENCE__ = resolve; }); throw new Error("private delayed architecture error"); }
      return { status: "partial", reportId: "fixture-fence" };
    }
    if (action === "inspect-task-contract") {
      if (window.__KUJO_DELAY_SPEC__) { await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_SPEC__ = resolve; }); throw new Error("private delayed contract error"); }
      return { status: "warnings", reportId: "fixture-spec" };
    }
    if (action === "run-example") return { status: "passed", checked: true, runtimeVersion: "1.8.1", source: "print(36)", output: '{"items":2,"language":"Kujo","total":36}' };
  };
}
