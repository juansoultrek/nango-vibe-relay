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

```bash
npm run build
node --env-file=.env dist/server.js
```

## Commit style

`Nango Vibe Relay | short imperative summary`

## Env

See [.env.example](.env.example).

## Deploy (GitHub Actions)

Push to **`main`** runs [`.github/workflows/deploy-ssh.yml`](.github/workflows/deploy-ssh.yml): build here, SCP a tarball, then remote **`npm ci --omit=dev`**.

Many cPanel SSH sessions **do not** put `npm` on `PATH` (Actions used to fail with `npm: command not found`). The workflow resolves **`npm`** in this order: optional secret **`DEPLOY_NPM_BIN`**, then **`$HOME/nodevenv/public_html/<same-path-after-public_html>/<ver>/bin/npm`** derived from **`DEPLOY_REMOTE_APP_DIR`**, then `find ~/nodevenv`, then **`/opt/cpanel/ea-nodejs*/bin/npm`**. If deploy still fails at `npm ci`, over SSH run something like **`ls "$HOME/nodevenv/public_html/juansoultrek.com/nango/"*/bin/npm`** (mirror your app path under `public_html/`) and save that path as **`DEPLOY_NPM_BIN`**.

The bundle intentionally **does not** include `.htaccess`. When you create the Node app, the panel generates `.htaccess` in the application root with **Passenger** (or equivalent) rules. Extracting our minimal repo `.htaccess` over that file **breaks routing**: LiteSpeed serves static files (including the default Node hello-world snippet) instead of running `dist/server.js`, and routes like `/nango/health` return **404**. To disable directory listings only, add `Options -Indexes` manually to the panel-managed `.htaccess` if you want.

Configure **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH hostname (no scheme) |
| `DEPLOY_SSH_PORT` | SSH port |
| `DEPLOY_SSH_USERNAME` | SSH user |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key PEM (including headers) |
| `DEPLOY_REMOTE_APP_DIR` | Absolute path on the server to the app root (`package.json` + root **`server.js`** shim that loads `dist/server.js`) |
| `DEPLOY_NPM_BIN` | *(Optional)* Full path to `npm` on the host if auto-discovery fails (e.g. `/opt/cpanel/ea-nodejs20/bin/npm`) |

In **Setup Node.js App** / Passenger, set **Application startup file** to **`server.js`** (some panels ignore `dist/server.js`). After deploy, restart the app if it does not pick up `tmp/restart.txt` automatically.

Application secrets (`OPENAI_API_KEY`, etc.) stay on your host’s runtime env, not necessarily in GitHub unless you explicitly want them here.

Because the workflow file is readable to everyone if the repo is public, treat logs and masking carefully — see [`docs/github-actions-security.md`](docs/github-actions-security.md).
