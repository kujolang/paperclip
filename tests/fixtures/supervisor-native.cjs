const fs = require("node:fs");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const root = process.argv[2];
spawn(process.execPath, [join(__dirname, "supervisor-descendant.cjs"), root], { stdio: "inherit" });
fs.writeFileSync(join(root, "native-pid"), String(process.pid));
setInterval(() => fs.writeFileSync(join(root, "native-tick"), String(Date.now())), 50);
process.on("SIGTERM", () => {});
