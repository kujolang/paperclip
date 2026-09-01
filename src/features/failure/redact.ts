const RULES: RegExp[] = [
  /\b(?:sk|sk-proj|ghp|github_pat|glpat)-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];

export function redactText(value: string): { text: string; count: number } {
  let text = value;
  let count = 0;
  for (const rule of RULES) {
    text = text.replace(rule, () => {
      count += 1;
      return "[REDACTED]";
    });
  }
  return { text, count };
}

export function truncateMiddle(value: string, maxBytes: number): { text: string; truncated: boolean; originalBytes: number; storedBytes: number } {
  const source = Buffer.from(value, "utf8");
  if (source.byteLength <= maxBytes) {
    return { text: value, truncated: false, originalBytes: source.byteLength, storedBytes: source.byteLength };
  }
  const marker = Buffer.from(`\n[... ${source.byteLength - maxBytes} bytes omitted due to evidence limit ...]\n`);
  const available = Math.max(0, maxBytes - marker.byteLength);
  const start = source.subarray(0, Math.floor(available / 2));
  const end = source.subarray(source.byteLength - Math.ceil(available / 2));
  const text = Buffer.concat([start, marker, end]).toString("utf8");
  return { text, truncated: true, originalBytes: source.byteLength, storedBytes: Buffer.byteLength(text) };
}

