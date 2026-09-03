export type PluginDetailTabProps = {
  context: { entityType: string; entityId: string };
};

declare global {
  interface Window {
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
  };
}
