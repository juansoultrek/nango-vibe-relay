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

## Optional: cPanel hosting

[docs/cpanel-hosting.md](docs/cpanel-hosting.md)
