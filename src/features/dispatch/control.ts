import { z } from "zod";
import type { ExecuteKujoResult } from "../../runtime/types.js";
import { dispatchActorSchema, dispatchLegacyDecisionSchema, dispatchRunIdSchema } from "./native.js";

const record = z.record(z.string(), z.unknown());
const controlSchema = z.discriminatedUnion("available", [
  z.object({ schema: z.literal("kujo.control-view/v1"), available: z.literal(false), reason: z.literal("control_view_limit") }).strict(),
  z.object({
    schema: z.literal("kujo.control-view/v1"), available: z.literal(true), run_id: dispatchRunIdSchema,
    state_revision: z.number().int().positive(), run_status: z.string().min(1).max(100),
    human_intervention: record.nullable(), current_control_boundary: record.nullable(),
  }).strict(),
]);
export type DispatchControlView = z.infer<typeof controlSchema>;

/** Consume canonical inspection only; never read the mutable state.json snapshot.
 * This observation supplies review facts, not proof of host authorization or a
 * reconciled journal. Dispatch must recheck the revision under its own lock.
 */
export function readDispatchControlView(result: Pick<ExecuteKujoResult, "exitCode" | "timedOut" | "stdout">, expectedRunId: string): DispatchControlView {
  try {
    dispatchRunIdSchema.parse(expectedRunId);
    if (result.exitCode !== 0 || result.timedOut || Buffer.byteLength(result.stdout) > 500000) throw new Error();
    const envelope = z.object({ command: z.literal("inspect"), ok: z.literal(true), run_id: dispatchRunIdSchema, control: z.unknown() }).parse(JSON.parse(result.stdout));
    if (envelope.run_id !== expectedRunId || Buffer.byteLength(JSON.stringify(envelope.control) ?? "") > 65536) throw new Error();
    const view = controlSchema.parse(envelope.control);
    if (view.available && view.run_id !== expectedRunId) throw new Error();
    return view;
  } catch { throw new Error("dispatch_control_unavailable"); }
}

const approvalRequestSchema = z.object({
  schema_version: z.literal("1.0"), event_type: z.literal("human_intervention_required"),
  event_id: z.string().min(1).max(200), expires_at: z.null(),
  run: z.object({ run_id: dispatchRunIdSchema, step_id: z.string().min(1).max(200) }),
  security: z.object({ decision_id: z.string().min(1).max(200) }),
  allowed_actions: z.array(z.string()).max(20),
});

/** Internal plan construction. The actor must come from authenticated host
 * context; callers still need fresh host approval bound to the complete native
 * command/component/runtime/policy and persistent owner before invocation.
 */
export function bindDispatchLegacyDecision(view: DispatchControlView, input: {
  decision: "approve" | "reject"; actor: z.infer<typeof dispatchActorSchema>; response: string; decidedAt: string;
}) {
  try {
    if (Buffer.byteLength(JSON.stringify(view)) > 65536) throw new Error();
    const observed = controlSchema.parse(view);
    if (!observed.available || !["paused", "needs_changes"].includes(observed.run_status)) throw new Error();
    const request = approvalRequestSchema.parse(observed.human_intervention);
    if (request.run.run_id !== observed.run_id || !request.allowed_actions.includes(input.decision)) throw new Error();
    return dispatchLegacyDecisionSchema.parse({
      run_id: observed.run_id, step_id: request.run.step_id, event_id: request.event_id,
      decision_id: request.security.decision_id, expected_state_revision: observed.state_revision,
      decision: input.decision, actor: input.actor, response: input.response, decided_at: input.decidedAt,
    });
  } catch { throw new Error("dispatch_approval_unavailable"); }
}
