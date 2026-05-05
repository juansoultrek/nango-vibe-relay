# Nango Vibe Relay

Node.js + TypeScript demo: message + emoji → **OpenAI** → optional **Nango** → **Google Sheets** + **Slack**, with a polled step log.

## Local run

```bash
npm ci
cp .env.example .env
# set OPENAI_API_KEY; add Nango/Sheets/Slack when ready
npm run dev
```

Then open `http://localhost:8787` (unless `PORT` is set).

### Test Google Sheets only (no AI, no Slack)

Ensure **`NANGO_*`**, **`GOOGLE_SPREADSHEET_ID`**, and **`GOOGLE_SHEETS_TAB_ID`** (usually `0` for the first tab — same number as **`#gid=`** in the Sheets URL). Rows are appended with **`spreadsheets.batchUpdate`** + **`appendCells`** so the Nango proxy URL stays free of **`Sheet1!A1`**-style paths that break encoding.

```bash
curl -sS -X POST "http://localhost:8787/test/sheets" \
  -H "Content-Type: application/json" \
  -d '{}'
```

`GET /test/sheets-meta` — read-only (spreadsheet title through Nango). Use this if proxy rows show **Failed** but OAuth shows **Success**: if GET fails too, the problem is token/scopes/ID/API enablement, not `batchUpdate`.

```bash
curl -sS "http://localhost:8787/test/sheets-meta"
```

With a path prefix (e.g. app under `/nango`), call `http://localhost:8787/nango/test/sheets` when the host forwards the full path, or `/test/sheets` when the proxy strips the prefix — same pattern as `/health`.

```bash
npm run build
node --env-file=.env dist/server.js
```

## Commit style

`Nango Vibe Relay | short imperative summary`

## Env

See [.env.example](.env.example).

## Deploy (GitHub Actions)

Push to **`main`** runs [`.github/workflows/deploy-ssh.yml`](.github/workflows/deploy-ssh.yml): **`npm ci`** + **`npm run build`** on Ubuntu, then **`npm ci --omit=dev`** so **`node_modules`** contains only runtime dependencies (today: **express**). That tree is **packed into the tarball** and extracted on the server — **no `npm` on cPanel SSH**.

If you later add packages with native/binary addons, bundling from CI may stop working; install on the host instead.

The bundle intentionally **does not** include `.htaccess`. When you create the Node app, the panel generates `.htaccess` in the application root with **Passenger** (or equivalent) rules. Extracting our repo `.htaccess` over that file **breaks routing**. To disable directory listings only, add `Options -Indexes` manually to the panel-managed `.htaccess` if you want.

Configure **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH hostname (no scheme) |
| `DEPLOY_SSH_PORT` | SSH port |
| `DEPLOY_SSH_USERNAME` | SSH user |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key PEM (including headers) |
| `DEPLOY_REMOTE_APP_DIR` | Absolute path on the server to the app root (`package.json`, **`dist/server.js`**, bundled **`node_modules`**) |

In **Setup Node.js App** / Passenger, set **Application startup file** to **`dist/server.js`** (or root **`server.js`** only if your panel requires that shim). After deploy, restart the app if it does not pick up `tmp/restart.txt` automatically.

Application secrets (`OPENAI_API_KEY`, etc.) stay on your host’s runtime env, not necessarily in GitHub unless you explicitly want them here.

Because the workflow file is readable to everyone if the repo is public, treat logs and masking carefully — see [`docs/github-actions-security.md`](docs/github-actions-security.md).
