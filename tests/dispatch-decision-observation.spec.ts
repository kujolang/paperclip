import { describe, expect, it } from "vitest";
import { readDecisionObservation } from "../src/features/dispatch/decision-observation.js";

const expected = { run_id: "run-fixture", decision_id: "decision-one", expected_state_revision: 3 };
const receipt = { schema: "kujo.paperclip.dispatch-decision-observation/v1", ...expected, observed_state_revision: 8, run_status: "completed", match: "exact", decision_status: "applied" };
const output = (value: unknown) => ({ exitCode: 0, timedOut: false, stdout: JSON.stringify(value) });
describe("native decision observation boundary", () => {
  it.each(["applied", "failed", "claimed"])("preserves the exact native %s status without promoting it", status => {
    expect(readDecisionObservation(output({ ...receipt, decision_status: status }), expected).decision_status).toBe(status);
  });
  it.each(["conflict", "not-observed", "unverifiable"])("does not invent a status for %s evidence", match => {
    expect(readDecisionObservation(output({ ...receipt, match, decision_status: null }), expected)).toMatchObject({ match, decision_status: null });
    expect(() => readDecisionObservation(output({ ...receipt, match }), expected)).toThrow(/unavailable/);
  });
  it("rejects foreign identities, revisions, malformed states and incomplete output", () => {
    for (const changed of [{ run_id: "run-foreign" }, { decision_id: "foreign" }, { expected_state_revision: 4 }, { observed_state_revision: 0 }, { decision_status: "unknown" }, { decision_status: null }, { private_response: "must not return" }]) {
      expect(() => readDecisionObservation(output({ ...receipt, ...changed }), expected)).toThrow(/unavailable/);
    }
    for (const changed of [{ exitCode: 1 }, { timedOut: true }, { stdout: "{" }, { stdout: " ".repeat(8193) }]) {
      expect(() => readDecisionObservation({ ...output(receipt), ...changed }, expected)).toThrow(/unavailable/);
    }
  });
});
