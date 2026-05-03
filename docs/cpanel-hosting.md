# Optional: cPanel (e.g. Namecheap)

Only if your hosting includes **Software → Setup Node.js App**.

1. `npm ci && npm run build` locally.
2. Upload `package.json`, `package-lock.json`, `dist/`, `public/` to the app root (not `node_modules/`).
3. In cPanel create the Node app: startup file **`dist/server.js`**, Node 20+, run **Run NPM Install**, set env vars like `.env.example`, **Restart**.
4. Use `process.env.PORT` in production — do not hard-code a port.

Namecheap KB: https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/
