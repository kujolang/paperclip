// Fixed host orchestration only. Fence owns configuration, selection, import
// extraction/resolution, architecture decisions and report semantics.
export const FENCE_BRIDGE = String.raw`from src.config import load_config
from src.validate import validate_config
from src.walk import select_inventory_files
from src.analyze import analyze_snapshot
from src.reports import summarize, render_json
from src.paths import is_safe_output
from src.util import dict_has

func blocked(message, diagnostics) {
    return { "phase": "blocked", "message": message, "diagnostics": diagnostics, "selected": [], "threshold": "", "report": null }
}
func inspect(manifest) {
    let loaded = load_config()
    if loaded["found"] == false { return { "phase": "not-configured", "message": "No readable fence.toml or fence.json was included in the snapshot.", "diagnostics": [], "selected": [], "threshold": "", "report": null } }
    if loaded["ok"] == false { return blocked(loaded["error"], []) }
    mut config = loaded["config"]
    let diagnostics = validate_config(config)
    mut di = 0
    while di < len(diagnostics) {
        if diagnostics[di]["severity"] == "error" { return blocked("Fence configuration is invalid.", diagnostics) }
        di = di + 1
    }
    if len(keys(config["parser_adapters"])) > 0 { return blocked("Configured parser commands require execution approval and cannot run in read-only inspection.", diagnostics) }
    let aliases = keys(config["aliases"])
    mut ai = 0
    while ai < len(aliases) {
        if is_safe_output(config["aliases"][aliases[ai]]) == false { return blocked("Snapshot aliases must be relative and cannot traverse parent directories.", diagnostics) }
        ai = ai + 1
    }
    let selected = select_inventory_files(manifest["candidates"], config["source_roots"], config["include"], config["exclude"])
    if config["max_files"] > 0 && len(selected) > config["max_files"] { return blocked("Selected sources exceed the project's max_files limit.", diagnostics) }
    if len(selected) == 0 { return { "phase": "empty", "message": "No Git-visible files match this Fence configuration.", "diagnostics": diagnostics, "selected": selected, "threshold": config["fail_on"], "report": null } }
    mut admitted = []
    mut si = 0
    while si < len(selected) {
        if dict_has(manifest["copied"], selected[si]) { admitted = push(admitted, selected[si]) }
        si = si + 1
    }
    // A host resource ceiling may tighten, never relax, a project's budget.
    if config["max_imports"] == 0 || config["max_imports"] > 20000 { config["max_imports"] = 20000 }
    let result = analyze_snapshot(admitted, config, manifest["regular"])
    let summary = summarize(result, config)
    return { "phase": "analyzed", "message": "", "diagnostics": diagnostics, "selected": selected, "threshold": config["fail_on"], "report": parse_json(render_json(result, summary, loaded["path"])) }
}
params := args()
try {
    let manifest = parse_json(read_file(params[0]))
    print(to_json(inspect(manifest)))
} except e {
    print(to_json(blocked(to_string(e), [])))
}
`;
