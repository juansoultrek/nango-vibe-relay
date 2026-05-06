# Nango Vibe Relay

Node.js + TypeScript demo: a short message plus a **mood picker id** → **OpenAI** (JSON mood label + paraphrase + note) → optional **Nango** proxy → **Google Sheets** and/or **Slack**, with a polled step log in the browser.

---

## Prerequisites

- **Node.js 20+** (see `engines` in `package.json`; `npm run dev` uses `node --env-file`, which requires a recent Node).
- **npm** (comes with Node). This repo keeps a `package-lock.json`; use **`npm ci`** for reproducible installs.

---

## Run on localhost (follow in order)

These steps are written so a clean clone can reach a working UI with **OpenAI** only. Nango-backed steps stay optional until you fill in their variables.

### 1. Install dependencies

At the repository root (directory that contains **`package.json`**):

```bash
npm ci
```

### 2. Create `.env`

```bash
cp .env.example .env
```

### 3. Minimum configuration (OpenAI required for `/submit`)

Edit `.env` and set:

- **`OPENAI_API_KEY`** — from [OpenAI API keys](https://platform.openai.com/api-keys).

Optional:

- **`OPENAI_MODEL`** — defaults to `gpt-4o-mini` if unset.

Without `OPENAI_API_KEY`, validation passes but the **OpenAI** step fails when you submit the form.

### 4. Start the development server

```bash
npm run dev
```

This runs **`src/server.ts`** via **`tsx` watch** and loads **`.env`** using Node’s **`--env-file=.env`** flag (see `package.json` → `scripts.dev`).

> **Important:** the file **`.env` must exist**. If you skipped step 2, create an empty file first (`touch .env`) and add keys; otherwise Node exits when it cannot read `--env-file=.env`.

### 5. Open the app

Default URL:

**`http://localhost:8787`**

If `PORT` is unset, the server listens on **8787** (see `src/server.ts`). Example override:

```bash
PORT=9000 npm run dev
```

### 6. Try the UI

1. Enter **10–500 characters** in the message box (see `LogStore` limits).
2. Tap **one** mood tile. The browser sends a **stable picker id** (kebab-case, e.g. `star-struck`, `upside-down`), not the raw Unicode character, to OpenAI; Sheets receive the **emoji glyph** mapped server-side.
3. Click **Relay vibe** and watch the step log (`GET /logs/:requestId` polling).

You should see **Validate input** → **OpenAI** succeed if the key is valid.

**Google Sheets** / **Slack** steps may **error** until Nango + spreadsheet + channel env vars are configured; the pipeline still attempts them and then finishes.

### 7. Health check (optional)

```bash
curl -sS http://localhost:8787/health
```

Check `openai.apiKeySet` is `true` without exposing the secret value.

---

## Run the compiled bundle locally (production-like)

Build TypeScript to `dist/`:

```bash
npm run build
```

Run with the same `.env` file:

```bash
node --env-file=.env dist/server.js
```

**`npm start`** runs **`node dist/server.js`** only—**it does not load `.env`**. Use it when your process manager or shell already exports `OPENAI_*`, `NANGO_*`, etc., which is typical on a host.

---

## Environment variables (reference)

Full list and comments: **[`.env.example`](.env.example)**.

### OpenAI

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for a successful AI step. |
| `OPENAI_MODEL` | Optional; default `gpt-4o-mini`. |

### Nango (Sheets + Slack)

| Variable | Purpose |
| --- | --- |
| `NANGO_SECRET_KEY` | Server secret from the Nango dashboard. |
| `NANGO_HOST` | Optional; defaults to `https://api.nango.dev` (change if your tenant uses another base). |
| `NANGO_PROVIDER_CONFIG_KEY_GOOGLE_SHEETS` | Must match the **Integration ID** shown in Nango for your Google Sheets integration (not necessarily the literal string `google-sheet`). |
| `NANGO_PROVIDER_CONFIG_KEY_SLACK` | Same idea for Slack (templates often use `slack`; custom integrations look like `nango-slack-…`). You can alternatively set legacy alias `NANGO_SLACK_INTEGRATION_ID`. Same pattern: `NANGO_GOOGLE_SHEETS_INTEGRATION_ID` for Sheets. |
| `NANGO_CONNECTION_ID_GOOGLE` | Connection ID after you OAuth Google in Nango. |
| `NANGO_CONNECTION_ID_SLACK` | Connection ID after you OAuth Slack in Nango. |

### Google Sheets

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SPREADSHEET_ID` | Target spreadsheet ID from the Sheets URL. |
| `GOOGLE_SHEETS_TAB` / `GOOGLE_SHEETS_TAB_NAME` | Tab **title** (default `Sheet1`). |
| `GOOGLE_SHEETS_ENSURE_HEADERS` | When truthy (default behavior), writes column headers once if `A1` is empty. Set `false`/`0` to skip. |

The implementation calls Google’s **`spreadsheets.values.append`** with **`valueInputOption=USER_ENTERED`** through Nango’s proxy (`Authorization: Bearer …`, `Provider-Config-Key`, `Connection-Id`). Use a **relative** provider path (e.g. `v4/spreadsheets/{id}/values/...:append`), not a full `https://sheets.googleapis.com/...` pasted as the path segment.

### Slack

| Variable | Purpose |
| --- | --- |
| `SLACK_CHANNEL_ID` | Channel ID (`C…`), not `#name`. Invite the Slack app/bot into that channel. |

The relay posts with Slack’s **`chat.postMessage`** (see `src/services/slackService.ts`). Nango’s Slack base URL already ends with **`/api/`**; do **not** prefix the path with extra `api/`.

### Reverse proxy / subpath

| Variable | Purpose |
| --- | --- |
| `APP_BASE_PATH` / `BASE_PATH` / `APPLICATION_BASE_PATH` | Mount the Express router under a prefix (no trailing slash), e.g. `/nango` when the panel serves the app under a subdirectory. |
| `PORT` | Listening port (`8787` default). |

See comments in **`src/server.ts`** for **`APP_BASE_AUTO_NANGO`** when `PORT` is set without an explicit base.

---

## cURL examples for integration tests

### Google Sheets connectivity only (`POST`; no OpenAI, no Slack)

Requires Nango **Google** env + **`GOOGLE_SPREADSHEET_ID`**.

```bash
curl -sS -X POST "http://localhost:8787/test/sheets" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Read-only metadata (helps separate OAuth/proxy vs append issues):

```bash
curl -sS "http://localhost:8787/test/sheets-meta"
```

If the live app mounts under a prefix, prefix these paths accordingly (same rule as `/health`).

Enable **`SHEETS_DEBUG=1`** in `.env` for richer failure logs (`GET /health` shows whether the process sees `SHEETS_DEBUG`).

---

## End-to-end checklist

After **OpenAI**, **Nango Google**, **spreadsheet**, **Nango Slack**, and **`SLACK_CHANNEL_ID`** look correct:

1. Submit from the UI.
2. Confirm the step order: **OpenAI** → **Google Sheets append** → **Slack**.
3. A row appears in Sheets; a message arrives in Slack.

Picker ids and English-only model fields are enforced in **`src/services/aiService.ts`**.

---

## Commit style

`Nango Vibe Relay | short imperative summary`

---

## Deploy (GitHub Actions)

Push to **`main`** runs [`.github/workflows/deploy-ssh.yml`](.github/workflows/deploy-ssh.yml): **`npm ci`** + **`npm run build`** on Ubuntu, then **`npm ci --omit=dev`** so **`node_modules`** contains only runtime dependencies (currently **express**). That tree is packed into an archive and extracted on your server (**no remote `npm install`** unless you change the workflow).

If you ship native/binary dependencies later, revise the workflow or install on the host manually.

Tarballs from **GitHub Actions** intentionally **exclude** **`.htaccess`**: Passenger/LiteSpeed panels usually generate that file; extracting a repo copy on top can break Node routing (see comment in [`.github/workflows/deploy-ssh.yml`](.github/workflows/deploy-ssh.yml)).

Configure **repository secrets** (GitHub repo → Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_HOST` | SSH hostname (no scheme). |
| `DEPLOY_SSH_PORT` | SSH port. |
| `DEPLOY_SSH_USERNAME` | SSH user. |
| `DEPLOY_SSH_PRIVATE_KEY` | PEM private key for deploy (with headers). |
| `DEPLOY_REMOTE_APP_DIR` | Absolute path on the server to app root (`dist/server.js`, bundled `node_modules`, `public/`, etc.). |

In **Setup Node.js App** / Passenger, set the startup file to **`dist/server.js`** (or shim **`server.js`** if the panel insists). Restart after deploy (e.g. `tmp/restart.txt` on Passenger-compatible hosts).

Keep production secrets (**`OPENAI_API_KEY`**, Nango keys, etc.) on the host environment or vault — not committed to git.

Public workflow definitions are visible; see [`docs/github-actions-security.md`](docs/github-actions-security.md).
