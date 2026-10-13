export type PluginDetailTabProps = {
  context: { entityType: string; entityId: string };
};

declare global {
  interface Window {
    __KUJO_NAVIGATE__?: (companyId: string) => void;
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
    if (action === "inspect-task-contract") {
      if (window.__KUJO_DELAY_SPEC__) { await new Promise<void>((resolve) => { window.__KUJO_RESOLVE_SPEC__ = resolve; }); throw new Error("private delayed contract error"); }
      return { status: "warnings", reportId: "fixture-spec" };
    }
    if (action === "run-example") return { status: "passed", checked: true, runtimeVersion: "1.8.1", source: "print(36)", output: '{"items":2,"language":"Kujo","total":36}' };
  };
}
