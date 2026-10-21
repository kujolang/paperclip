# Node.js runtime

Use `nvm use` from the repository root to select Node 24.22.1. Node 26.12.1 and later is also supported; Node 25 is end-of-life. Install dependencies with `npm ci --ignore-scripts`, then run `npm run verify`.

These minimums include the [October 21, 2026 Node.js security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Updating npm dependencies alone does not update the Node runtime.
