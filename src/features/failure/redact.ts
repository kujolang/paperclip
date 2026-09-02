const RULES: RegExp[] = [
  /\b(?:sk(?:-proj)?-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|glpat-[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{16})\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
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
  if (marker.byteLength >= maxBytes) {
    const text = validUtf8Prefix(source, maxBytes);
    return { text, truncated: true, originalBytes: source.byteLength, storedBytes: Buffer.byteLength(text) };
  }
  const available = Math.max(0, maxBytes - marker.byteLength);
  const start = validUtf8Prefix(source, Math.floor(available / 2));
  const end = validUtf8Suffix(source, Math.ceil(available / 2));
  const text = `${start}${marker.toString("utf8")}${end}`;
  return { text, truncated: true, originalBytes: source.byteLength, storedBytes: Buffer.byteLength(text) };
}

function validUtf8Prefix(source: Buffer, maxBytes: number): string {
  for (let length = Math.min(maxBytes, source.byteLength); length >= Math.max(0, maxBytes - 3); length -= 1) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(source.subarray(0, length));
    } catch { /* Try the preceding code-point boundary. */ }
  }
  return "";
}

function validUtf8Suffix(source: Buffer, maxBytes: number): string {
  const start = Math.max(0, source.byteLength - maxBytes);
  for (let offset = start; offset <= Math.min(source.byteLength, start + 3); offset += 1) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(source.subarray(offset));
    } catch { /* Try the next code-point boundary. */ }
  }
  return "";
}
