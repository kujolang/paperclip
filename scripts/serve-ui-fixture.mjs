import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const root = new URL("../.ui-test-dist/", import.meta.url).pathname;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(204).end();
    return;
  }

  const path = request.url === "/app.js" || request.url === "/app.js.map"
    ? join(root, request.url.slice(1))
    : new URL("../tests/ui/fixture.html", import.meta.url).pathname;

  response.setHeader("Content-Type", contentTypes.get(extname(path)) ?? "application/octet-stream");
  createReadStream(path)
    .on("error", () => response.writeHead(404).end("Not found"))
    .pipe(response);
}).listen(4317, "127.0.0.1");
