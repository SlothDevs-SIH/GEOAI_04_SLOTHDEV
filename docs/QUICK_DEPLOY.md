# Quick Deployment Guide · GEOAI 04

This project supports two primary deployment models:
1. **All-in-One Container (Recommended)**: Both frontend web app + FastAPI engine run inside a single Docker container (Hugging Face Spaces or Render).
2. **Decoupled**: Frontend on **Vercel** + Backend on **Hugging Face Spaces** or **Render**.

---

## Option 1: Hugging Face Docker Space (Recommended · Free 16 GB RAM)

> [!TIP]
> **Why this is the best choice:** Satellite image processing (Sentinel-2 COGs and ML models) requires memory (up to 1–2 GB during analysis). Hugging Face Spaces offers **16 GB RAM & 2 vCPUs completely FREE**. The container serves both the web frontend and the backend API on the same domain—no CORS configuration needed!

### Steps:
1. Go to [huggingface.co/new-space](https://huggingface.co/new-space).
2. Name your space (e.g. `geoai04`).
3. Select **Docker** as the Space SDK.
4. Choose **CPU Basic · 2 vCPU · 16 GB RAM** (Free).
5. Set visibility to **Public** and click **Create Space**.
6. Push this repository to your Space:
   ```bash
   git remote add space https://huggingface.co/spaces/<YOUR_HF_USERNAME>/<YOUR_SPACE_NAME>
   git push space main
   ```
   *(If prompted for credentials, use your Hugging Face username and an Access Token with write permissions from `huggingface.co/settings/tokens`).*

7. Wait ~4–6 minutes for the Docker image to build.
8. Once built:
   - Your web app is live at: `https://<YOUR_HF_USERNAME>-<YOUR_SPACE_NAME>.hf.space/`
   - Your API is live at: `https://<YOUR_HF_USERNAME>-<YOUR_SPACE_NAME>.hf.space/api`
   - Check health: `https://<YOUR_HF_USERNAME>-<YOUR_SPACE_NAME>.hf.space/health`

---

## Option 2: Vercel (Frontend) + Hugging Face / Render (Backend)

The web app is **static-first**: all 7 demo scenes, swipe map, sensitivity lab, and offline PWA work on Vercel **even without a backend**. The API is only needed when users draw custom areas on the map or upload custom GeoTIFFs.

### Part A: Deploy Web App to Vercel
1. Go to [vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New > Project**, and select `SlothDevs-SIH/GEOAI_04_SLOTHDEV`.
3. In configuration:
   - **Root Directory**: Select `web` (or leave default root, our fail-safe `vercel.json` handles both).
   - **Framework Preset**: `Vite`.
4. (Optional) If your backend is already deployed, add Environment Variable:
   - `VITE_API_URL` = `https://<YOUR_HF_USERNAME>-<YOUR_SPACE_NAME>.hf.space` (or your Render URL, without trailing slash).
5. Click **Deploy**.

### Part B: Connect to Live API
If you deployed Vercel first without the backend:
1. Deploy the backend on Hugging Face (Option 1) or Render (Option 3).
2. In Vercel Project Settings > **Environment Variables**, add:
   - `VITE_API_URL` = `https://<YOUR_BACKEND_URL>`
3. In Hugging Face / Render settings, set environment variable:
   - `ALLOWED_ORIGINS` = `https://<YOUR_VERCEL_APP>.vercel.app` (or `*`).
4. Redeploy Vercel to pick up the new variable.

---

## Option 3: Render (Free Fallback)

Render has pre-configured Blueprint support via [`render.yaml`](../render.yaml).

> [!NOTE]
> Render's free tier has **512 MB RAM** and spins down after 15 minutes of inactivity. Keep AOI bounding boxes small to avoid running out of memory.

### Steps:
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New > Blueprint**.
3. Connect your GitHub repository `SlothDevs-SIH/GEOAI_04_SLOTHDEV`.
4. Render will read [`render.yaml`](../render.yaml) and automatically configure the Docker service.
5. Click **Apply**.
6. Once deployed, verify via `https://<your-service>.onrender.com/health`.

---

## Option 4: Local Docker / Self-Hosted VPS

To run the full stack locally or on any cloud VPS (AWS EC2, DigitalOcean, Hetzner, GCP):

```bash
# 1. Build the all-in-one image
docker build -t geoai04 .

# 2. Run the container
docker run -d -p 7860:7860 --name geoai04 geoai04

# 3. Access
# Open http://localhost:7860 in your browser
# API is accessible at http://localhost:7860/api
# Health check: http://localhost:7860/health
```

---

## Post-Deployment Verification Checklist

- [ ] Open the live URL on desktop and mobile. All 7 demo scenes load.
- [ ] Test the swipe slider and toggle the false-alarm filter on/off.
- [ ] Test offline capability: in Chrome DevTools > Network, check "Offline", then reload the page. The demo and Sensitivity Lab should still work.
- [ ] Test live analysis (requires API): Go to **Analyse**, draw a small bounding box (≤ 5 km), click **Check scenes**, then **Analyse this area**.
- [ ] Update `README.md` and `docs/DECISIONS.md` with your live URLs.
