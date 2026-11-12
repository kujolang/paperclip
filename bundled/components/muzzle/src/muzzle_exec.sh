#!/usr/bin/env bash
set -u

safe_execution_ancestors() {
	if [[ -L .muzzle || -L .muzzle/state || -L .muzzle/state/executions ]]; then
		echo "muzzle-exec: unsafe execution state directory" >&2
		return 2
	fi
}

cleanup_execution_root() {
	safe_execution_ancestors || return 2
	local target="$1"
	if [[ ! "$target" =~ ^\.muzzle/state/executions/[0-9a-f]{32}$ ]]; then
		echo "muzzle-exec: refusing unsafe execution-root cleanup" >&2
		return 2
	fi
	rm -rf -- "$target"
}

if [[ "${1:-}" == "--cleanup" ]]; then
	[[ "$#" -eq 2 ]] || exit 2
	cleanup_execution_root "$2"
	exit $?
fi

if [[ "${1:-}" == "--cleanup-owner" ]]; then
	[[ "$#" -eq 2 && "$2" =~ ^[0-9]+$ ]] || exit 2
	safe_execution_ancestors || exit 2
	for owned_root in .muzzle/state/executions/*; do
		[[ -d "$owned_root" && ! -L "$owned_root" ]] || continue
		[[ "$owned_root" =~ ^\.muzzle/state/executions/[0-9a-f]{32}$ ]] || continue
		[[ -f "$owned_root/.owner" && ! -L "$owned_root/.owner" ]] || continue
		[[ "$(<"$owned_root/.owner")" == "$2" ]] || continue
		cleanup_execution_root "$owned_root"
	done
	exit 0
fi

if [[ "$#" -lt 8 ]]; then
	echo "muzzle-exec: expected runner, script, digest, execution root, log, verbose flag, Kujo binary, and delimiter" >&2
	exit 2
fi

runner="$1"
script_path="$2"
expected_sha256="$3"
execution_root="$4"
log_path="$5"
verbose="$6"
kujo_bin="$7"
shift 7

if [[ "${1:-}" != "--" ]]; then
	echo "muzzle-exec: missing argument delimiter" >&2
	exit 2
fi
shift

if [[ "${#expected_sha256}" -ne 64 || "$expected_sha256" == *[!0-9a-fA-F]* ]]; then
	echo "muzzle-exec: invalid expected workflow digest" >&2
	exit 2
fi
if [[ ! "$execution_root" =~ ^\.muzzle/state/executions/[0-9a-f]{32}$ ]]; then
	echo "muzzle-exec: invalid execution root" >&2
	exit 2
fi

portable_sha256() {
	if command -v shasum >/dev/null 2>&1; then
		shasum -a 256 <"$1" | awk '{print $1}'
	elif command -v sha256sum >/dev/null 2>&1; then
		sha256sum <"$1" | awk '{print $1}'
	else
		return 127
	fi
}

link_directory_except() {
	local source_dir="$1"
	local target_dir="$2"
	local excluded="$3"
	local entry name
	local -a batch=()
	local batch_bytes=0
	for entry in "$source_dir"/* "$source_dir"/.[!.]* "$source_dir"/..?*; do
		[[ -e "$entry" || -L "$entry" ]] || continue
		name="${entry##*/}"
		[[ "$name" == "$excluded" ]] && continue
		# Bound argv size as well as process count on both BSD and GNU ln.
		if [[ "${#batch[@]}" -gt 0 && ( "${#batch[@]}" -ge 64 || "$((batch_bytes + ${#entry}))" -gt 16384 ) ]]; then
			ln -s "${batch[@]}" "$target_dir/" || return 2
			batch=()
			batch_bytes=0
		fi
		batch+=("$entry")
		batch_bytes=$((batch_bytes + ${#entry} + 1))
	done
	if [[ "${#batch[@]}" -gt 0 ]]; then
		ln -s "${batch[@]}" "$target_dir/" || return 2
	fi
	return 0
}

caller_umask="$(umask)"
umask 077
# Create the Muzzle-owned log before snapshot preparation so a fail-closed
# integrity denial still leaves the declared evidence artifact behind.
if ! : >"$log_path"; then
	echo "muzzle-exec: log capture failed; workflow was not started" >&2
	exit 74
fi
safe_execution_ancestors || exit 2
mkdir -p .muzzle/state/executions || exit 2
chmod 700 .muzzle/state .muzzle/state/executions || exit 2
if [[ -e "$execution_root" || -L "$execution_root" ]]; then
	echo "muzzle-exec: execution root already exists" >&2
	exit 2
fi
mkdir "$execution_root" || exit 2
printf '%s\n' "$PPID" >"$execution_root/.owner" || exit 2
trap 'cleanup_execution_root "$execution_root"' EXIT
trap 'exit 130' HUP INT TERM

before_snapshot_pause_ms="${MUZZLE_TEST_PAUSE_BEFORE_SNAPSHOT_MS:-0}"
if [[ "${MUZZLE_TEST_MODE:-}" == "1" && "$before_snapshot_pause_ms" =~ ^[0-9]+$ ]]; then
	sleep_seconds=$((before_snapshot_pause_ms / 1000))
	sleep_millis=$((before_snapshot_pause_ms % 1000))
	sleep "${sleep_seconds}.$(printf '%03d' "$sleep_millis")"
fi

project_root="$(pwd -P)"
workflows_root="$project_root/.muzzle/workflows"
script_dir="$(cd "$(dirname "$script_path")" && pwd -P)"
script_absolute="$script_dir/$(basename "$script_path")"
case "$script_absolute" in
	"$workflows_root"/*) workflow_relative="${script_absolute#"$workflows_root"/}" ;;
	*) echo "muzzle-exec: workflow escaped the canonical workflow root" >&2; exit 2 ;;
esac

shadow_project="$execution_root/project"
shadow_muzzle="$shadow_project/.muzzle"
shadow_workflows="$shadow_muzzle/workflows"
mkdir -p "$shadow_workflows" || exit 2
link_directory_except "$project_root" "$shadow_project" ".muzzle" || exit 2
link_directory_except "$project_root/.muzzle" "$shadow_muzzle" "workflows" || exit 2

# read/IFS stops at a newline, but newlines are valid filename characters.
workflow_parts=()
remaining_path="$workflow_relative"
while [[ "$remaining_path" == */* ]]; do
	workflow_parts+=("${remaining_path%%/*}")
	remaining_path="${remaining_path#*/}"
done
workflow_parts+=("$remaining_path")
source_cursor="$workflows_root"
shadow_cursor="$shadow_workflows"
last_part_index=$((${#workflow_parts[@]} - 1))
for part_index in "${!workflow_parts[@]}"; do
	part="${workflow_parts[$part_index]}"
	if [[ "$part_index" -eq "$last_part_index" ]]; then
		link_directory_except "$source_cursor" "$shadow_cursor" "$part" || exit 2
		snapshot_path="$shadow_cursor/$part"
		cp -- "$source_cursor/$part" "$snapshot_path" || exit 2
		chmod 500 "$snapshot_path" || exit 2
	else
		link_directory_except "$source_cursor" "$shadow_cursor" "$part" || exit 2
		mkdir "$shadow_cursor/$part" || exit 2
		source_cursor="$(cd "$source_cursor/$part" && pwd -P)"
		shadow_cursor="$shadow_cursor/$part"
	fi
done

snapshot_sha256="$(portable_sha256 "$snapshot_path")" || {
	echo "muzzle-exec: no SHA-256 utility is available" >&2
	exit 2
}
snapshot_sha256="$(printf '%s' "$snapshot_sha256" | tr '[:upper:]' '[:lower:]')"
expected_sha256="$(printf '%s' "$expected_sha256" | tr '[:upper:]' '[:lower:]')"
if [[ "$snapshot_sha256" != "$expected_sha256" ]]; then
	echo "muzzle-exec: workflow changed after validation; execution denied" | tee -a "$log_path" >&2
	exit 3
fi
: >"$execution_root/.snapshot-ready"

after_snapshot_pause_ms="${MUZZLE_TEST_PAUSE_AFTER_SNAPSHOT_MS:-0}"
if [[ "${MUZZLE_TEST_MODE:-}" == "1" && "$after_snapshot_pause_ms" =~ ^[0-9]+$ ]]; then
	sleep_seconds=$((after_snapshot_pause_ms / 1000))
	sleep_millis=$((after_snapshot_pause_ms % 1000))
	sleep "${sleep_seconds}.$(printf '%03d' "$sleep_millis")"
fi

# Restore the caller's umask so workflow-created files keep their original
# semantics; the log was already created privately above.
umask "$caller_umask"

case "$runner" in
	kujo)
		command_argv=("$kujo_bin" run "$snapshot_path")
		;;
	bash)
		command_argv=(bash -c 'source "$1" "${@:2}"' "$script_path" "$snapshot_path")
		;;
	python)
		command_argv=(python3 -c 'import os,sys; original,snapshot=sys.argv[1:3]; args=sys.argv[3:]; source=open(snapshot,"rb").read(); sys.argv=[original]+args; sys.path[0]=os.path.dirname(os.path.abspath(original)); scope={"__name__":"__main__","__file__":original,"__package__":None,"__cached__":None}; exec(compile(source,original,"exec"),scope,scope)' "$script_path" "$snapshot_path")
		;;
	node)
		command_argv=(node -e 'const fs=require("fs"),path=require("path"),Module=require("module");const original=process.argv[1],snapshot=process.argv[2],args=process.argv.slice(3);process.argv=[process.execPath,original,...args];const main=new Module(original,null);main.filename=original;main.paths=Module._nodeModulePaths(path.dirname(path.resolve(original)));process.mainModule=main;main._compile(fs.readFileSync(snapshot,"utf8"),original);' "$script_path" "$snapshot_path")
		;;
	*)
		echo "muzzle-exec: unsupported runner: $runner" >&2
		exit 2
		;;
esac

if [[ "$verbose" == "true" ]]; then
	set +e
	"${command_argv[@]}" "$@" 2>&1 | tee "$log_path"
	pipeline_status=("${PIPESTATUS[@]}")
	workflow_status="${pipeline_status[0]}"
	if [[ "${pipeline_status[1]}" -ne 0 ]]; then
		echo "muzzle-exec: log capture failed; full output may be incomplete" >&2
		# Preserve an existing workflow failure; never turn sink failure into success.
		[[ "$workflow_status" -ne 0 ]] || workflow_status=74
	fi
	set -e
else
	set +e
	"${command_argv[@]}" "$@" >"$log_path" 2>&1
	workflow_status="$?"
	set -e
fi

exit "$workflow_status"
