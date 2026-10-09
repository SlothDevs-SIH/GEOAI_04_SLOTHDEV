# Deployment Guide

**Goal:** a public website (Vercel) and, optionally, a live API (Hugging Face Space, with Render as the fallback).
**The site works without the API**: the four demo scenes are static files, and the offline cache (PWA) keeps them usable with no network.
Only "Analyse any area" and uploads need the API.

---

## 0. What is already verified

| Check | Result |
|---|---|
| Backend tests and lint | 92 tests pass, lint clean |
| Web tests, lint, typecheck, build | 39 unit tests pass, build produces the PWA (216 files, about 9 MB cached) |
| End-to-end in a real browser | 4 Playwright tests pass, including **opening the demo with the network off** |
| Docker image | See section 3 (built and run locally; result recorded there) |

What cannot be checked from this laptop: the live hosts below (they need your accounts).

---

## 1. Vercel (the website)

1. vercel.com, sign in with GitHub, **Add New, Project**, import `SlothDevs-SIH/GEOAI_04_SLOTHDEV`.
2. **Root Directory:** `web`. Framework: Vite (it reads `web/vercel.json`).
3. **Environment variable** (only when the API is live): `VITE_API_URL` = the API root, for example `https://<user>-<space>.hf.space` (no trailing slash).
4. Deploy. Open the URL; the four scenes must load with the API off.
5. Put the URL in the README ("Live site").

If the repo is under an organisation, the organisation must allow the Vercel app, or import a fork you own.

---

## 2. The API

### Option A: Hugging Face Docker Space (preferred: 2 vCPU, 16 GB RAM)
1. huggingface.co, **New Space**, SDK **Docker**, hardware **CPU basic**, visibility **Public**.
   *Docker Spaces may need a paid plan (the documentation and recent forum posts disagree). If the dialog refuses, use Option B.*
2. Space settings, **Variables**: `ALLOWED_ORIGINS` = your Vercel URL (or `*` while testing).
3. Push this repo to the Space (the Dockerfile is at the root and listens on port 7860):
   ```
   git remote add space https://huggingface.co/spaces/<user>/<space>
   git push space main
   ```
   The Space needs a `README.md` header with `sdk: docker` and `app_port: 7860`; the Space creation page shows it.
4. Wait for the build (about 5 to 10 minutes). Check `https://<user>-<space>.hf.space/health` returns `{"ok": true, ...}`.

### Option B: Render (fallback, free but small)
1. render.com, **New, Blueprint**, pick this repo (it reads `render.yaml`).
2. Render free instances have about **512 MB RAM** and **sleep after 15 minutes idle** (about a minute to wake). Spectral analysis of a small box and the demo scenes fit; big boxes may run out of memory.
3. Check `https://<name>.onrender.com/health`.

### Option C: a laptop for the demo only
`docker run -p 7860:7860 geoai04:test`, then open http://localhost:7860 . The container serves both the site and the API on one address.

---

## 3. Local container check (what was run on this laptop)

```
docker build -t geoai04:test .
docker run --rm -p 7860:7860 geoai04:test
# then: http://localhost:7860/  and  http://localhost:7860/health
```

**Result (run on this laptop, 9 Oct 2026):** the image builds (1.5 GB on disk) and the container reports `healthy`. Verified inside it:

| Check | Result |
|---|---|
| `/health`, `/api/health`, `/demos`, the site at `/` | all 200 |
| PWA files (`sw.js`, manifest) and a demo image | all 200 |
| `POST /fetch-s2` with a box that is too big | 400 with a plain message |
| `POST /fetch-s2/preview` (Delhi NCR, real archive, from inside the container) | correct scenes in about 27 s |
| **A full live analysis** of a 4 km box in Delhi NCR (2019 vs 2025) | fetched in about 40 s, analysed in 2 s: **1,831 raw detections to 59 real changes**; the swipe-map files, PDF and GeoPackage were all served |
| Memory | about 220 MiB idle; **about 480 MiB at the end of the 4 km job** |

**What the memory number means for hosting:** a Render free instance has about 512 MB, so it can run a small box but a larger one (up to the 15 km limit) is likely to run out of memory. A Hugging Face Space (16 GB) has no such problem. Prefer Option A; with Option B, tell users to draw small boxes.

---

## 4. After deploying

- [ ] Open the Vercel URL on a phone. The four scenes load; the swipe works.
- [ ] Turn off the network, reload: the demo still opens, with the "Offline" badge.
- [ ] With the API live: **Analyse, Draw an area**, pick a box in your city, **Check scenes**, then **Analyse this area**.
- [ ] Add both URLs to `README.md` and `docs/DECISIONS.md`.
- [ ] Never put tokens in the repo: Earthdata and GFM tokens go in the host's secret store (`.env.example` lists the names).
