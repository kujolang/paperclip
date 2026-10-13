// Fixed orchestration over canonical Concord checks. No workspace code runs.
export const CONCORD_BRIDGE = String.raw`from src.snapshot import validate_snapshot_references
from src.scanner import find_readme, find_manifest_files, find_spec_files, find_changelog, find_cli_entry, discover_docs_files, discover_eval_files, discover_example_files
from src.checks.cli_docs import check_cli_docs
from src.checks.spec_eval import check_spec_eval
from src.checks.manifest_docs import check_manifest_docs
from src.checks.version_consistency import check_version_consistency
from src.checks.example_validity import check_example_validity
from src.checks.source_of_truth import check_source_of_truth
from src.reporter import generate_json_report

func inspect() {
    let issues = validate_snapshot_references(".")
    if len(issues) > 0 { return {"phase": "blocked", "issues": issues, "report": null} }
    let docs = discover_docs_files(".")
    let evals = discover_eval_files(".")
    let examples = discover_example_files(".")
    if find_readme(".") == "" && len(find_manifest_files(".")) == 0 && len(find_spec_files(".")) == 0 && find_changelog(".") == "" && find_cli_entry(".") == "" && len(docs["files"]) == 0 && len(evals["files"]) == 0 && len(examples["files"]) == 0 && docs["truncated"] == 0 && evals["truncated"] == 0 && examples["truncated"] == 0 {
        return {"phase": "empty", "issues": [], "report": null}
    }
    mut findings = []
    let groups = [check_cli_docs(".", ""), check_spec_eval("."), check_manifest_docs("."), check_version_consistency("."), check_example_validity(".", ""), check_source_of_truth(".")]
    for group in groups {
        for finding in group { findings = push(findings, finding) }
    }
    // Keep the canonical report semantics while omitting its duplicate grouping.
    let native = parse_json(generate_json_report(".", findings))
    return {"phase": "analyzed", "issues": [], "report": {"tool": native["tool"], "version": native["version"], "summary": native["summary"], "findings": native["findings"]}}
}
print(to_json(inspect()))
`;
