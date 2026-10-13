const fs = require("node:fs");
const { join } = require("node:path");
const root = process.argv[2];
fs.writeFileSync(join(root, "descendant-pid"), String(process.pid));
setInterval(() => fs.writeFileSync(join(root, "descendant-tick"), String(Date.now())), 50);
process.on("SIGTERM", () => {});
