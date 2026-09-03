import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("../.ui-test-dist/", import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [new URL("../tests/ui/fixture.tsx", import.meta.url).pathname],
  outfile: new URL("app.js", outputDirectory).pathname,
  alias: {
    "@paperclipai/plugin-sdk/ui": new URL("../tests/ui/sdk-stub.tsx", import.meta.url).pathname,
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: true,
  target: ["chrome120"],
});
