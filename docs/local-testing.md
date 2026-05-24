# Local end-to-end testing

Run the whole ClaimIt stack on your machine — frontend + any/all of the Python services — without merging to test. `scripts/fetch_env.sh` pulls every required env var from Google Secret Manager and writes a ready-to-go `.env.local` per service.

> ⚠️ **Everything below talks to the PROD `claimit-beta` GCP project.** There is no separate dev environment. Mongo writes are real, Anthropic spend is real, Firebase users are real, and outbound Gmail sends are real. Don't trigger destructive flows (claim send, account changes) unless that's the intent.

---

## 1. One-time setup (do this once per machine)

You need a Google account with `roles/secretmanager.secretAccessor` on the `claimit-beta` GCP project. Ping the team if you don't have it.

```bash
# Install gcloud CLI if you don't have it: https://cloud.google.com/sdk/docs/install

gcloud auth login                          # Secret Manager access
gcloud auth application-default login      # ADC for Firebase Admin / Vertex / Pub-Sub
gcloud config set project claimit-beta
```

**Firebase Console check:** Open the [Firebase Console for `claimit-beta`](https://console.firebase.google.com/project/claimit-beta/authentication/settings) → **Authentication → Settings → Authorized domains**. Confirm `localhost` is in the list. Without it, sign-in fails with `auth/unauthorized-domain`.

**Repo setup** (skip if you've already done it):

```bash
./scripts/setup.sh                  # Node + git hooks
./scripts/setup.sh --with-python    # Also `uv sync` all Python agents (~300MB)
```

---

## 2. Fastest path: FE-only against the deployed BFF

This is the unblocker for "I changed something in `apps/web` and want to see it work without merging to trigger Vercel." Local Next.js dev server talks directly to the deployed api-gateway on Cloud Run.

```bash
./scripts/fetch_env.sh web
pnpm --filter web dev
```

Open **http://localhost:3000** and sign in. Hot reload works as normal.

**What got configured:**
- `apps/web/.env.local` populated with Firebase web SDK config + `NEXT_PUBLIC_API_BASE_URL` pointing at the deployed Cloud Run BFF
- CORS is already whitelisted on the deployed BFF for `http://localhost:3000` (`infra/terraform/main.tf`)

---

## 3. Full local stack

When your change is to a Python service, you'll need that service running locally and the FE pointed at your local BFF.

### Step 1 — fetch envs for whichever services you want to run

```bash
./scripts/fetch_env.sh api-gateway        # required if you point FE at local BFF
./scripts/fetch_env.sh ingest-agent       # only if testing ingest
./scripts/fetch_env.sh monitor-agent      # only if testing price monitoring
./scripts/fetch_env.sh claim-agent        # only if testing claim drafting
./scripts/fetch_env.sh assistant-agent    # only if testing chat
./scripts/fetch_env.sh sync-worker        # rarely needed locally
```

Each writes `apps/<service>/.env.local`. Re-run with `--force` to refresh if a secret rotates.

### Step 2 — point the FE at your local BFF

```bash
./scripts/fetch_env.sh web --force --local-backend
```

This sets `NEXT_PUBLIC_API_BASE_URL=http://localhost:8005` instead of the deployed URL.

### Step 3 — run the services

Each in its own terminal:

```bash
pnpm --filter web dev                                                       # :3000
cd apps/api-gateway     && uv run uvicorn src.main:app --reload --port 8005
cd apps/ingest-agent    && uv run uvicorn src.main:app --reload --port 8001
cd apps/monitor-agent   && uv run uvicorn src.main:app --reload --port 8002
cd apps/claim-agent     && uv run uvicorn src.main:app --reload --port 8003
cd apps/assistant-agent && uv run uvicorn src.main:app --reload --port 8004
cd apps/sync-worker     && uv run uvicorn src.main:app --reload --port 8006
```

You only need to run the services you're testing. The api-gateway can call the deployed agents if you don't override `ASSISTANT_AGENT_URL` etc. in its `.env.local`.

---

## 4. Switching modes

| You want to... | Run |
|---|---|
| Test FE only, against deployed BFF | `./scripts/fetch_env.sh web --force` then `pnpm --filter web dev` |
| Test FE + local BFF | `./scripts/fetch_env.sh web --force --local-backend` then run both |
| Refresh a service's `.env.local` after a secret rotates | `./scripts/fetch_env.sh <service> --force` |

The script refuses to overwrite an existing `.env.local` unless you pass `--force`.

---

## 5. Known limitations

These aren't bugs in the setup — they're inherent to the prod-only environment and standard local dev. Plan around them.

### Gmail OAuth from a local api-gateway won't complete

`GMAIL_OAUTH_REDIRECT_URI` is registered against the deployed Cloud Run callback. If you start the OAuth flow from a local api-gateway, Google will still redirect back to the prod URL.

**Workaround:** test the Gmail-connect button via FE-only mode (against the deployed BFF), or accept that local api-gateway can't exercise the OAuth callback.

### Pub/Sub push subscriptions can't deliver to localhost

Handlers under `/pubsub/*` (e.g. `purchase.uploaded`, `price.dropped`, `claim.approved`) won't fire automatically when running an agent locally. Pub/Sub push subscriptions only target the deployed Cloud Run URLs.

**Workarounds:**
- **Manual POST** — craft an envelope and `curl` it directly to your local agent. `PUBSUB_AUTH_DISABLED=1` is already in the generated `.env.local` so OIDC verification won't reject your fake envelope.
- **ngrok** — tunnel your localhost to a public URL and temporarily repoint the subscription via `gcloud pubsub subscriptions update`. Don't forget to revert.

### Mixed local / deployed services don't compose cleanly

The deployed api-gateway only talks to the deployed agents (it has their Vertex Agent Engine resource IDs baked in). You can't run "local FE + deployed BFF + local agent" — the deployed BFF won't call your local agent.

If you're testing a backend change, run BOTH the api-gateway and your changed agent locally.

### Deploy-time outage window

Every prod deploy resets the api-gateway Cloud Run image to GCP's `hello-world` placeholder for ~2–3 minutes while the new image rebuilds. If your local testing breaks suddenly, check the GitHub Actions deploy queue — you may have caught a deploy mid-flight. (Filed separately; not local-dev specific.)

---

## 6. Troubleshooting

### `auth/unauthorized-domain` when signing in

`localhost` isn't in the Firebase Authorized Domains list. Fix it once in the Firebase Console (see step 1).

### `gcloud secrets versions access` returns PERMISSION_DENIED

Your account doesn't have `roles/secretmanager.secretAccessor` on `claimit-beta`. Ask the team to grant it.

### Script says "Active gcloud project is X; expected claimit-beta"

```bash
gcloud config set project claimit-beta
```

### Script says "Application Default Credentials not set"

You skipped step 1's `application-default login`. Re-run:

```bash
gcloud auth application-default login
```

### Backend service fails to start with `MONGODB_URI` KeyError

Your `.env.local` wasn't loaded. uvicorn loads `.env` by default but `.env.local` needs an explicit hint — confirm you ran the service from inside `apps/<service>/` (not the repo root) and that `.env.local` is in that directory.

### FE fetches return CORS errors

Your `NEXT_PUBLIC_API_BASE_URL` is set to a backend the deployed BFF doesn't expect requests from, or you're running api-gateway locally without `CORS_ALLOWED_ORIGINS=http://localhost:3000` in its `.env.local`. Re-run `./scripts/fetch_env.sh api-gateway --force`.

### "Analyzing..." spinner forever after a receipt upload

Could be the `DuplicateKeyError` bug tracked in issue #225 — the ingest-agent doesn't gracefully handle order_id collisions. Check `apps/ingest-agent` Cloud Run logs for the actual error.

---

## 7. What the script actually does

For the curious:

1. Validates `gcloud` is installed, active project is `claimit-beta`, and you've run `auth login` (+ `auth application-default login` for backend services).
2. For each env var the service needs that lives in Secret Manager, runs `gcloud secrets versions access latest --secret=<id>` and grabs the value.
3. Combines those with the static (non-secret) env vars defined inline in the script — bucket names, Cloud Run URLs, Phoenix endpoints, etc. (mirrors `infra/terraform/main.tf`).
4. Writes the assembled file to `apps/<service>/.env.local` atomically.
5. Refuses to overwrite without `--force`. Prints the prod-data warning after every successful write.

`.env.local` is gitignored in every workspace — you won't accidentally commit it.

---

## 8. Questions / things broken

Ping in `#claimit-dev` (or whichever channel you use). Common gotchas above; if you hit something not listed, file an issue and tag whoever owns the relevant service.
