# Pattern catalogs are supplied by src/redact.kujo. Scan the complete stream
# before taking its tail so a distant BEGIN marker cannot expose a key body.
BEGIN {
    single_count = split(singles, single_patterns, /[|]/)
    block_count = split(starts, block_starts, /[|]/)
    split(ends, block_ends, /[|]/)
    for (i = 1; i <= single_count; i++) single_patterns[i] = tolower(single_patterns[i])
}
function retain(text) {
    # Do not silently expose a prefix of an oversized diagnostic line.
    if (length(text) > 4096) text = "[Oversized log line omitted; inspect the full log.]"
    tail[count % limit] = text
    count++
}
{
    if (active) {
        if (index($0, block_ends[active])) {
            active = 0
            retain(marker)
        }
        next
    }
    for (i = 1; i <= block_count; i++) {
        if (index($0, block_starts[i])) {
            active = i
            if (index($0, block_ends[i])) {
                active = 0
                retain(marker)
            }
            break
        }
    }
    if (i <= block_count) next
    lower = tolower($0)
    for (i = 1; i <= single_count; i++) {
        if (index(lower, single_patterns[i])) {
            retain(marker)
            break
        }
    }
    if (i > single_count) retain($0)
}
END {
    if (active) retain(marker)
    first = count > limit ? count - limit : 0
    for (i = first; i < count; i++) print tail[i % limit]
}
