// Run canonical metadata checks on the private copy. Replace only its Git
// observation with a native check of the host-owned original workspace.
export const SHIPCHECK_BRIDGE = String.raw`from src.scan import run_scan
from src.checks import check_git_repo
from src.report import report_json

params := args()
manifest := parse_json(read_file(params[0]))
mut result = run_scan(".")
mut checks = result["checks"]
mut replaced = 0
mut i = 0
while i < len(checks) {
    if checks[i]["name"] == "git-repo" {
        checks[i] = check_git_repo(manifest["workspace"])
        replaced = replaced + 1
    }
    i = i + 1
}
if replaced != 1 { exit(2) }
result["checks"] = checks
report_json(result)
`;
