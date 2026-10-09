# One container: FastAPI engine + the built web app (same origin, routes under /api).
# Hugging Face Docker Space: port 7860.   Local: docker build -t geoai04 . && docker run -p 7860:7860 geoai04

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ENV VITE_API_URL=/api
RUN npx vite build

FROM python:3.11-slim
WORKDIR /app
# rasterio's wheel bundles GDAL but needs the system expat library
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine/ engine/
COPY api/ api/
COPY eval/ eval/
COPY web/public/ web/public/
COPY --from=web /web/dist web/dist
ENV RUNS_DIR=/tmp/runs PORT=7860
EXPOSE 7860
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/health')"
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
