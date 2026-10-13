// Thin projection over pinned Kujo RAG. No workspace code or dotenv loader runs.
export const RAG_BRIDGE = `from src.config import default_config
from src.rag_engine import build_rag_index, query_rag
from src.common import dict_get_or

params := parse_json(read_file("request.json"))
cfg := default_config()
cfg["namespace"] = params["namespace"]
cfg["namespace_index_isolation"] = false
cfg["index_path"] = "native-index.json"
cfg["ingest_extensions"] = ["md", "markdown", "txt", "kujo"]
cfg["max_file_bytes"] = 65536
cfg["api_guardrail_ingest_max_files"] = 64
cfg["api_guardrail_ingest_max_total_bytes"] = 131072
cfg["top_k"] = 6
if params["action"] == "ingest" {
    result := build_rag_index("corpus", cfg, true)
    ingest := dict_get_or(result, "ingest", {})
    print(to_json({
        "ok": dict_get_or(result, "ok", false),
        "aborted": dict_get_or(ingest, "aborted", true),
        "stats": dict_get_or(ingest, "stats", {}),
        "chunks": dict_get_or(result, "chunks", 0)
    }))
    if dict_get_or(result, "ok", false) && dict_get_or(ingest, "aborted", true) == false {
        write_file("retained-index.json", to_json(result["index"]))
    }
} else {
    index := parse_json(read_file("retained-index.json"))
    result := query_rag(index, params["question"], cfg, {}, [])
    print(to_json(result))
}
`;
