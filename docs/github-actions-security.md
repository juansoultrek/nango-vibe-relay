# CI security (public repository)

This repo may be **public**: anyone can read workflow **definitions**. Treat GitHub Actions as part of your public footprint.

## What is public vs private

| Item | Visible to strangers? |
|------|-------------------------|
| `.github/workflows/*.yml` (steps, job names, **secret names** referenced as `secrets.*`) | Yes |
| **Values** of GitHub Secrets | No (stored only in GitHub; not in git) |
| Workflow **run logs** (Actions tab) | Yes — treat them as semi-public |

## Practices we follow here

1. **No plaintext infrastructure** — host, SSH port, deploy directory, and key material come only from **Secrets** / the **`production`** environment.
2. **Minimal permissions** — `permissions: contents: read`; no needless extra scopes.
3. **Concurrency** — one deploy at a time so runs do not overwrite each other.
4. **Quiet installs** — `npm ci` uses `--no-audit --no-fund` where possible to reduce log noise (not a secrecy substitute).
5. **No `.env` in the tarball** — only `dist/`, `public/`, manifests. Runtime secrets normally live **on the server**, not inside the artifact.
6. **Dependabot for Actions** — see `.github/dependabot.yml`.

## What you should still do manually

- **Never** `echo`, `printenv`, or `cat` secret material in CI steps; masking is best-effort only.
- **Review** Actions logs after failed runs for unintended output; rotate deploy keys if something sensitive appeared.
- **Optional:** GitHub [**Environments**](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment) (`production`) with protection rules or environment-only secrets.
- Protect **GitHub** with **2FA** and tighten **branch protection** on `main` if others can push — a pushed commit can deploy.
