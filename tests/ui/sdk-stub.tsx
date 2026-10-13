export type PluginDetailTabProps = {
  context: { entityType: string; entityId: string };
};

declare global {
  interface Window {
    __KUJO_NAVIGATE__?: (companyId: string) => void;
    __KUJO_DELAY_FORMAT__?: boolean;
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
    if (action === "run-example") return { status: "passed", checked: true, runtimeVersion: "1.8.1", source: "print(36)", output: '{"items":2,"language":"Kujo","total":36}' };
  };
}
