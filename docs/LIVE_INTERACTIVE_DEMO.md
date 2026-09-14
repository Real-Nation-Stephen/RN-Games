# Live interactive Flows — demo runbook

This is a **skinnable live framework**, not a Heineken-only game. Client branding (logo, colours, type, fill mask, poll art, wheel/scratcher assets) is configuration. Heineken tomorrow is one skin of the same engine.

## Verified so far

Label claims honestly:

- **Isolated CAS + simulated 15:** `npm run test:live` (in-process handlers, memory compare-and-set store).
- **Isolated HTTP + built pages:** `npm run test:live:http` (file CAS for **both** platform seed/config and live run state; 15 HTTP clients; no production Blobs).
- **15 real phones:** not yet (needs LAN or an approved preview deploy).
- **Real 150 / simulated 150:** not claimed.

Live run documents use a dedicated store (`rngames-live-local` on the laptop, `rngames-live` in production) with genuine `onlyIfMatch` / `onlyIfNew` writes. Platform config/seed in isolated QA uses `rngames-platform-local`, never `rngames-platform`. Installed `@netlify/blobs` must support conditional writes in production; if it does not, the function fails closed (503). Hosted deploy-preview / branch-deploy cannot enable memory/file drivers or unsigned JWT auth.

Polling uses a `viewToken` that includes projected poll/wheel completion and presence counts, so clients see automatic reveal without a GET write.

Editor conventions for Mini Poll, Fill Game, and live join branding: [LIVE_EDITOR_PARITY.md](./LIVE_EDITOR_PARITY.md).


## Isolated local QA (preferred)

```bash
npm run build:preview
npm run test:live
npm run test:live:http
# unique-dir browser session (does not wipe other QA dirs):
npm run qa:live
```

`qa:live` prints Studio, Master, Presenter, and two Join origins (`127.0.0.1` vs `localhost`) so phone identities are independent. Each run uses `.netlify/isolated-qa/run-*`. `test:live:http` also uses a unique directory and only deletes that directory when it exits without `--keep`. It will not `rm` a caller-supplied path unless `reset: true` is passed and the path is under `.netlify/isolated-qa`.

## Linked Netlify CLI (optional, not required)

Only if you have already confirmed the CLI is **not** using production Blobs credentials:

```bash
LIVE_BLOB_STORE=rngames-live-local PLATFORM_BLOB_STORE=rngames-platform-local LIVE_STORE_DRIVER=file LIVE_DEV_AUTH=1 npx netlify-cli dev
```

Do not seed or run 15-client checks against `rngames-platform` or a production blob endpoint.

## Demo flow

1. Isolated HTTP path above, or Studio `POST /api/live-demo-seed` with operator auth (disabled on hosted deploys unless `LIVE_ALLOW_SEED=1`).
2. Open **Flow Master from Studio** (`Open Flow Master`), or the printed `#hk=` URL. Visiting `/x/live-demo/master` without a host key cannot create or reset a run.
3. Presenter `/x/live-demo/present`. Phones `/x/live-demo/join` or `/j/{CODE}`.

Reset creates the new run and swaps the active pointer before marking the old run superseded. A failed reset leaves the previous active run usable.

## After QA

Do not commit, push, or deploy until you say so.
