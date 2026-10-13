import { describe, expect, it } from "vitest";
import { readDispatchControlView, bindDispatchLegacyDecision, type DispatchControlView } from "../src/features/dispatch/control.js";
import { dispatchCommandSchema } from "../src/features/dispatch/native.js";

const request = { schema_version: "1.0", event_type: "human_intervention_required", expires_at: null, event_id: "event-one", run: { run_id: "run-one", step_id: "approval" }, security: { decision_id: "decision-one" }, allowed_actions: ["approve", "reject"] };
const view = { schema: "kujo.control-view/v1", available: true, run_id: "run-one", state_revision: 12, run_status: "paused", human_intervention: request, current_control_boundary: null } as const;
const input = () => ({ decision: "approve" as const, actor: { id: "human-one", type: "human" as const, authenticated_by: "host", authorization: "approval-123" }, response: "Reviewed", decidedAt: "2026-10-13T18:00:00Z" });
const result = (control: unknown = view) => ({ exitCode: 0, timedOut: false, stdout: JSON.stringify({ command: "inspect", ok: true, run_id: "run-one", control }) });

describe("canonical Dispatch control observations", () => {
  it("binds the exact observed gate, revision and host actor into a strict command", () => {
    const actor = input();
    const decision = bindDispatchLegacyDecision(readDispatchControlView(result(), "run-one"), actor);
    actor.actor.id = "changed";
    expect(decision).toMatchObject({ run_id: "run-one", step_id: "approval", event_id: "event-one", decision_id: "decision-one", expected_state_revision: 12, actor: { id: "human-one" } });
    expect(dispatchCommandSchema.parse({ operation: "decide-approval", decision })).toEqual({ operation: "decide-approval", decision });
    expect(() => dispatchCommandSchema.parse({ operation: "decide-approval", decision: { ...decision, expected_state_revision: 0 } })).toThrow();
    expect(() => dispatchCommandSchema.parse({ operation: "decide-approval", decision: { ...decision, decision: "retry_step" } })).toThrow();
  });
  it("refuses failed, timed-out, foreign, malformed and oversized observations", () => {
    for (const r of [{ ...result(), exitCode: 1 }, { ...result(), timedOut: true }, { ...result(), stdout: "bad" }, result({ ...view, run_id: "run-other" }), result({ ...view, state_revision: 0 }), result({ ...view, human_intervention: { ...request, content: "界".repeat(30000) } })]) {
      expect(() => readDispatchControlView(r, "run-one")).toThrow("dispatch_control_unavailable");
    }
    expect(() => readDispatchControlView(result(), "run-other")).toThrow("dispatch_control_unavailable");
  });
  it("preserves an unavailable observation without inventing an approval", () => {
    const unavailable = readDispatchControlView(result({ schema: "kujo.control-view/v1", available: false, reason: "control_view_limit" }), "run-one");
    expect(unavailable.available).toBe(false);
    expect(() => bindDispatchLegacyDecision(unavailable, input())).toThrow("dispatch_approval_unavailable");
  });
  it("refuses terminal, foreign, expired, v2 and disallowed legacy review requests", () => {
    const observations = [
      { ...view, run_status: "completed" },
      { ...view, human_intervention: { ...request, run: { ...request.run, run_id: "run-other" } } },
      { ...view, human_intervention: { ...request, expires_at: "2026-10-12T00:00:00Z" } },
      { ...view, human_intervention: { schema: "kujo.intervention-request/v2" } },
      { ...view, human_intervention: { ...request, allowed_actions: ["reject"] } },
    ];
    for (const observed of observations) expect(() => bindDispatchLegacyDecision(observed as DispatchControlView, input())).toThrow("dispatch_approval_unavailable");
  });
});
