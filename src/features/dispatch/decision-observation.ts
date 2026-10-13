import { z } from "zod";
import type { ExecuteKujoResult } from "../../runtime/types.js";

/** Thin projection over Dispatch's authoritative loader. Never resume, repair,
 * persist or interpret workflow transitions to discover a decision's outcome. */
export const DECISION_OBSERVER = String.raw`from src.core.state import load_run_state
from src.core.utils import dict_get_or
decision := parse_json(read_file(args()[0]))
loaded := load_run_state("runs", decision["run_id"])
if loaded["ok"] != true {throw("decision_observation_unavailable")}
state := loaded["run_state"]
if state["run_id"] != decision["run_id"] {throw("decision_observation_foreign_run")}
history := dict_get_or(state, "human_decisions", {})
receipt_match := "unverifiable"
status := null
if type(history) == "dict" {
    receipt_match = "not-observed"
    if has_key(history, decision["decision_id"]) {
        receipt_match = "unverifiable"
        receipt := history[decision["decision_id"]]
        if type(receipt) == "dict" {
            digest := dict_get_or(receipt, "decision_sha256", "")
            if type(digest) == "string"&&regex_match(digest, "^[0-9a-f]{64}$") {
                receipt_match = "conflict"
                if digest == sha256(to_json(decision)) {
                    receipt_match = "exact"
                    candidate := dict_get_or(receipt, "status", "")
                    if contains(["applied", "failed", "claimed"], candidate) {status = candidate}
                    else {receipt_match = "unverifiable"}
                }
            }
        }
    }
}
print(to_json({"schema":"kujo.paperclip.dispatch-decision-observation/v1", "run_id":state["run_id"], "decision_id":decision["decision_id"], "expected_state_revision":decision["expected_state_revision"], "observed_state_revision":dict_get_or(state,"revision",0), "run_status":dict_get_or(state,"status",""), "match":receipt_match, "decision_status":status}))
`;

const observationSchema = z.object({
  schema: z.literal("kujo.paperclip.dispatch-decision-observation/v1"),
  run_id: z.string().regex(/^run-[a-zA-Z0-9-]{1,120}$/), decision_id: z.string().min(1).max(200),
  expected_state_revision: z.number().int().positive(), observed_state_revision: z.number().int().positive(),
  run_status: z.string().min(1).max(100), match: z.enum(["exact", "conflict", "not-observed", "unverifiable"]),
  decision_status: z.enum(["applied", "failed", "claimed"]).nullable(),
}).strict().refine(value => (value.match === "exact") === (value.decision_status !== null));
export type DecisionObservation = z.infer<typeof observationSchema>;

export function readDecisionObservation(result: Pick<ExecuteKujoResult, "exitCode" | "timedOut" | "stdout">,
  expected: { run_id: string; decision_id: string; expected_state_revision: number }): DecisionObservation {
  try {
    if (result.exitCode !== 0 || result.timedOut || Buffer.byteLength(result.stdout) > 8192) throw new Error();
    const value = observationSchema.parse(JSON.parse(result.stdout));
    if (value.run_id !== expected.run_id || value.decision_id !== expected.decision_id || value.expected_state_revision !== expected.expected_state_revision) throw new Error();
    return value;
  } catch { throw new Error("dispatch_decision_observation_unavailable"); }
}
