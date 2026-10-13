// Invoke canonical Kennel parsers and manifest validator on private copies only.
// Never call info/install/resolution: those can read paths or use the network.
export const PACKAGE_BRIDGE = `from src.manifest import load_manifest, dependency_map, manifest_package_name, manifest_package_version
from src.validator import validate_manifest_declarations
from src.dependency_spec import source_ref_from_dependency_declaration
from src.lockfile import load_lockfile, packages
from src.utils import dict_get_or

loaded := load_manifest(".")
if loaded["ok"] == false {
 print(to_json({"manifest": null, "validation": {"ok": false, "errors": ["Manifest could not be parsed by Kennel"], "warnings": []}, "dependencies": [], "dependencyCount": 0, "lock": {"status": "not-read", "version": "", "entries": [], "count": 0}}))
 exit(0)
}
manifest := loaded["manifest"]
report := validate_manifest_declarations(manifest)
deps := dependency_map(manifest)
rows := []
for name in keys(deps) {
 if len(rows) >= 200 { break }
 parsed := source_ref_from_dependency_declaration(name, deps[name])
 display_source := to_string(dict_get_or(parsed, "source", ""))
 rows = push(rows, {"name": to_string(name), "valid": parsed["ok"], "kind": to_string(dict_get_or(parsed, "kind", "unknown")), "requested": to_string(dict_get_or(parsed, "requested", "")), "source": display_source, "diagnostic": to_string(dict_get_or(parsed, "error", ""))})
}
lock := load_lockfile(".")
lock_status := "missing"
lock_version := ""
lock_rows := []
lock_count := 0
if lock["ok"] {
 value := lock["lockfile"]
 lock_version = to_string(dict_get_or(value, "version", ""))
 lock_status = "parsed"
 if type(dict_get_or(value, "package", [])) != "array" { lock_status = "invalid-shape" }
 if lock_version != "1" { lock_status = "unsupported-version" }
 entries := packages(value)
 lock_count = len(entries)
 for entry in entries {
  if len(lock_rows) >= 200 { break }
  if type(entry) != "dict" { lock_status = "invalid-shape"; continue }
  lock_rows = push(lock_rows, {"name": to_string(dict_get_or(entry, "name", "")), "source": to_string(dict_get_or(entry, "source", "")), "resolvedRef": to_string(dict_get_or(entry, "resolved_ref", "")), "resolvedCommit": to_string(dict_get_or(entry, "resolved_commit", "")), "version": to_string(dict_get_or(entry, "version", ""))})
 }
} else { if lock["error"] != "missing" { lock_status = "invalid-toml" } }
print(to_json({"manifest": {"name": to_string(manifest_package_name(manifest)), "version": to_string(manifest_package_version(manifest)), "entry": to_string(dict_get_or(dict_get_or(manifest, "kujo", {}), "entry", ""))}, "validation": report, "dependencies": rows, "dependencyCount": len(keys(deps)), "lock": {"status": lock_status, "version": lock_version, "entries": lock_rows, "count": lock_count}}))
`;
