# API Examples

These are the canonical copyable API examples. They assume the API is already running.

```bash
API="${API:-http://127.0.0.1:4100}"
```

## System

```bash
curl -s "$API/"
```

```bash
curl -s "$API/health"
```

Fresh database expected health shape:

```json
{"status":"ok","database":"connected","items":5}
```

## Projects

```bash
curl -s "$API/projects"
```

```bash
curl -s -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Release Plan","description":"Tracks upcoming release tasks."}'
```

Duplicate project names return `409`:

```bash
curl -s -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d '{"name":"Documentation","description":"Already seeded."}'
```

```bash
curl -s "$API/projects/1"
```

```bash
curl -s "$API/projects/1/items"
```

## Items

```bash
curl -s "$API/items?limit=20&offset=0&sort_by=id&sort_dir=desc"
```

```bash
curl -s "$API/items?status=draft&q=patch"
```

```bash
curl -s "$API/items?limit=10&sort_by=id&sort_dir=desc&cursor=id:500"
```

```bash
curl -s -X POST "$API/items" \
  -H "Content-Type: application/json" \
  -d '{"title":"Demo item","content":"Created from API examples.","status":"draft","project_id":1}'
```

```bash
curl -s "$API/items/1"
```

Use the current item `updated_at` value as the optimistic concurrency token for update and delete calls.

```bash
updated_at="<current-updated-at>"

curl -s -X PUT "$API/items/1" \
  -H "Content-Type: application/json" \
  -H "If-Unmodified-Since: $updated_at" \
  -d '{"title":"Replaced title","content":"Replaced content","status":"published","project_id":1}'
```

```bash
curl -s -X PATCH "$API/items/1" \
  -H "Content-Type: application/json" \
  -H "If-Unmodified-Since: $updated_at" \
  -d '{"content":"Partially updated content"}'
```

```bash
curl -s -X DELETE "$API/items/1" \
  -H "If-Unmodified-Since: $updated_at"
```
