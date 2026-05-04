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

Push to **`main`** runs [`.github/workflows/deploy-ssh.yml`](.github/workflows/deploy-ssh.yml): build here, SCP a tarball, then remote `npm ci --omit=dev`.

Configure **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH hostname (no scheme) |
| `DEPLOY_SSH_PORT` | SSH port |
| `DEPLOY_SSH_USERNAME` | SSH user |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key PEM (including headers) |
| `DEPLOY_REMOTE_APP_DIR` | Absolute path on the server to the app root (`package.json` + root **`server.js`** shim that loads `dist/server.js`) |

In **Setup Node.js App** / Passenger, set **Application startup file** to **`server.js`** (some panels ignore `dist/server.js`). After deploy, restart the app if it does not pick up `tmp/restart.txt` automatically.

Application secrets (`OPENAI_API_KEY`, etc.) stay on your host’s runtime env, not necessarily in GitHub unless you explicitly want them here.

Because the workflow file is readable to everyone if the repo is public, treat logs and masking carefully — see [`docs/github-actions-security.md`](docs/github-actions-security.md).
