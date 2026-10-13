import type { ExecutionPlan } from "../../execution/contracts.js";
import { redactText } from "../failure/redact.js";
import type { DispatchControlView } from "./control.js";

/** The raw command is durable private execution input. Public plans use its
 * digest and the already-redacted review preview, never duplicate raw topics or
 * human responses into exports, history or agent messages. */
export function publicWorkflowPlan(plan: ExecutionPlan) {
  const { workflow, ...publicPlan } = plan;
  if (!workflow) throw new Error("Not a workflow plan");
  return { ...publicPlan, workflow: { parentId: workflow.parentId, storageDigest: workflow.storageDigest, operation: workflow.command.operation, commandDigest: plan.inputDigest } };
}
export type PublicWorkflowPlan = ReturnType<typeof publicWorkflowPlan>;
export const redactWorkflowValue = (value: unknown): unknown => typeof value === "string" ? redactText(value).text
    : Array.isArray(value) ? value.map(redactWorkflowValue)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [redactText(key).text, redactWorkflowValue(item)])) : value;

/** Display redaction never feeds the native controller. Admission reads a fresh
 * complete canonical view privately and binds the exact native revision. */
export function publicWorkflowControl(control: DispatchControlView | null): DispatchControlView | null {
  if (!control?.available) return control;
  return { ...control, human_intervention: redactWorkflowValue(control.human_intervention) as Record<string, unknown> | null,
    current_control_boundary: redactWorkflowValue(control.current_control_boundary) as Record<string, unknown> | null };
}
