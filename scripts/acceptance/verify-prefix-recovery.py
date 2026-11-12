#!/usr/bin/env python3
"""Read-only verification of the November 2026 empty npm-prefix recovery.

This is a verifier for the recorded recovery format, not a repair utility.
Only a disposable copy is passed to npm. Set TMPDIR to select temporary storage.
Historical byte-exact restoration cannot be established by this verifier.
"""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


METADATA = (
    "package.json",
    "package-lock.json",
    "node_modules/.package-lock.json",
)
DIRECTORIES = {
    "node_modules",
    "node_modules/.bin",
    "node_modules/@kujolang",
    "node_modules/@paperclipai",
}
PACKAGES = {
    "@kujolang/paperclip",
    "@kujolang/kujo-runtime",
    "@kujolang/kujo-darwin-x64",
    "@paperclipai/plugin-sdk",
    "@paperclipai/shared",
    "zod",
    "ajv",
    "ajv-formats",
    "json-schema-traverse",
    "three",
    "fast-uri",
    "fast-deep-equal",
    "require-from-string",
}
BIN_LINKS = {
    "paperclip-plugin-dev-server": "../@paperclipai/plugin-sdk/dist/dev-cli.js",
    "kujo": "../@kujolang/kujo-runtime/bin/kujo.js",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_contained(root, relative):
    """Read known small metadata without following child symlinks."""
    current = root
    for part in Path(relative).parts:
        require(part not in {"..", "/"}, "Unsafe metadata path")
        current = current / part
        require(not current.is_symlink(), "Metadata contains a symlink")
    require(current.is_file(), "Required metadata file missing")
    require(current.stat().st_size <= 1_048_576, "Metadata file exceeds limit")
    return current.read_bytes()


def prefix_inventory(prefix):
    require(not prefix.is_symlink() and prefix.is_dir(), "Prefix must be a real directory")
    observed = {}
    for parent, directories, files in os.walk(prefix, followlinks=False):
        for name in directories + files:
            path = Path(parent) / name
            relative = str(path.relative_to(prefix))
            require(not path.is_symlink(), "Prefix contains an unexpected symlink")
            if path.is_dir():
                require(relative in DIRECTORIES, "Prefix contains an unexpected directory")
                observed[relative] = {"kind": "directory"}
            else:
                require(relative in METADATA, "Prefix contains an unexpected file")
                data = read_contained(prefix, relative)
                observed[relative] = {"kind": "file", "sha256": sha256(data), "size": len(data)}
    require(set(observed) == DIRECTORIES | set(METADATA), "Prefix inventory differs from recovery format")
    return observed


def validate_recovery(prefix, backup):
    before = prefix_inventory(prefix)
    require(not backup.is_symlink() and backup.is_dir(), "Backup must be a real directory")
    recovery = json.loads(read_contained(backup, "recovery.json"))
    require(set(recovery["packages"]) == PACKAGES, "Recovery package set differs")
    require(len(recovery["packages"]) == len(PACKAGES), "Recovery package list contains duplicates")
    require(set(recovery["metadata"]) == set(METADATA), "Recovery metadata set differs")
    require(json.loads(read_contained(prefix, "package.json")) == {}, "Manifest is not empty")
    for relative, packages in (("package-lock.json", {"": {}}), ("node_modules/.package-lock.json", {})):
        lock = json.loads(read_contained(prefix, relative))
        require(lock == {"name": "plugins", "lockfileVersion": 3, "requires": True, "packages": packages},
                "Lockfile differs from the reconstructed empty format")
    for relative in METADATA:
        metadata = recovery["metadata"][relative]
        require(sha256(read_contained(backup, "metadata/" + relative)) == metadata["beforeSha256"],
                "Backup metadata checksum mismatch")
        require(before[relative]["sha256"] == metadata["restoredSha256"], "Restored metadata checksum mismatch")
    for package in sorted(PACKAGES):
        manifest = json.loads(read_contained(backup, "packages/" + package + "/package.json"))
        require(manifest.get("name") == package, "Quarantined package identity mismatch")
    bin_directory = backup / "bin"
    require(not bin_directory.is_symlink() and bin_directory.is_dir(), "Backup bin directory is invalid")
    require({path.name for path in bin_directory.iterdir()} == set(BIN_LINKS), "Backup bin inventory differs")
    for name, target in BIN_LINKS.items():
        path = bin_directory / name
        require(path.is_symlink() and os.readlink(path) == target, "Quarantined bin link mismatch")
    return before


def verify(prefix, backup):
    before = validate_recovery(prefix, backup)
    npm, node = shutil.which("npm"), shutil.which("node")
    require(npm is not None and node is not None, "npm and Node.js must be available")
    checks = []
    # No command receives the real prefix or backup. Copy only validated files,
    # never an unknown tree; all package-manager writes remain disposable.
    with tempfile.TemporaryDirectory(prefix="paperclip-prefix-recovery-") as temporary:
        root = Path(temporary)
        replica, home, fixture = root / "prefix", root / "home", root / "fixture"
        replica.mkdir()
        for relative in sorted(DIRECTORIES):
            (replica / relative).mkdir(parents=True, exist_ok=True)
        for relative in METADATA:
            (replica / relative).write_bytes(read_contained(prefix, relative))
        home.mkdir()
        fixture.mkdir()
        (fixture / "package.json").write_text(json.dumps({
            "name": "paperclip-prefix-recovery-probe", "version": "1.0.0", "main": "index.js",
            "bin": {"paperclip-prefix-recovery-probe": "bin.js"},
        }))
        (fixture / "index.js").write_text("module.exports = {recoveryProbe: true};\n")
        (fixture / "bin.js").write_text('#!/usr/bin/env node\nprocess.stdout.write("recovery-probe-ok\\n");\n')
        environment = {key: value for key, value in os.environ.items() if not key.lower().startswith("npm_config_")}
        environment.update({
            "HOME": str(home), "npm_config_cache": str(root / "cache"),
            "npm_config_userconfig": str(home / ".npmrc"),
            "npm_config_globalconfig": str(home / "global.npmrc"),
            "npm_config_update_notifier": "false",
        })

        def run(arguments, label):
            try:
                result = subprocess.run(arguments, cwd=replica, env=environment,
                                        text=True, capture_output=True, timeout=60, check=False)
            except subprocess.TimeoutExpired:
                raise ValueError(label + " timed out") from None
            require(result.returncode == 0, label + " failed (exit " + str(result.returncode) + ")")
            checks.append({"check": label, "exitCode": result.returncode})
            return result.stdout

        npm_args = [npm, "--prefix", str(replica)]
        safe_flags = ["--ignore-scripts", "--offline", "--no-audit", "--no-fund"]
        require(json.loads(run(npm_args + ["ls", "--all", "--json"], "empty-npm-ls")) == {}, "Initial tree is not empty")
        run(npm_args + ["ci"] + safe_flags, "offline-npm-ci")
        run(npm_args + ["install", "--install-links", str(fixture)] + safe_flags, "local-fixture-install")
        value = run([node, "-e", 'console.log(JSON.stringify(require("paperclip-prefix-recovery-probe")))'], "node-resolution")
        require(json.loads(value) == {"recoveryProbe": True}, "Fixture module returned an unexpected value")
        value = run([str(replica / "node_modules/.bin/paperclip-prefix-recovery-probe")], "bin-resolution")
        require(value.strip() == "recovery-probe-ok", "Fixture executable returned an unexpected value")
        run(npm_args + ["uninstall", "paperclip-prefix-recovery-probe"] + safe_flags, "local-fixture-uninstall")
        require(json.loads(run(npm_args + ["ls", "--all", "--json"], "empty-npm-ls-after-uninstall")) == {}, "Final tree is not empty")
        require(not json.loads((replica / "package.json").read_text()).get("dependencies"), "Fixture dependency remains")
        require(not any(json.loads((replica / "package-lock.json").read_text())["packages"]), "Fixture lock entry remains")
    require(prefix_inventory(prefix) == before, "Global prefix changed during verification")
    return {
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": "pass", "prefixState": "empty consistent npm prefix", "globalPrefixUnchanged": True,
        "recoveryBackupMetadataHashesVerified": len(METADATA),
        "quarantinedPackageManifestsVerified": len(PACKAGES), "quarantinedBinLinksVerified": len(BIN_LINKS),
        "checks": checks, "metadataSha256": {name: before[name]["sha256"] for name in METADATA},
        "historicalByteExactRestoration": "Unverifiable without authentic pre-probe metadata and inventory; backup beforeSha256 values are post-probe/pre-recovery.",
        "repairRequired": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefix", required=True, type=Path, help="Recovered empty npm prefix (read-only)")
    parser.add_argument("--backup", required=True, type=Path, help="Retained recovery backup (read-only)")
    arguments = parser.parse_args()
    try:
        result = verify(arguments.prefix.absolute(), arguments.backup.absolute())
    except (ValueError, OSError, KeyError, TypeError):
        # Avoid echoing arbitrary metadata, npm diagnostics, or personal paths.
        print(json.dumps({"status": "fail", "message": "Recovery validation or disposable npm probe failed; no repair attempted."}))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
