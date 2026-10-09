# Web prototype (round 1)

**Fastest:** open `index.html` in a browser (double-click). Everything it shows is precomputed by the real engine into `demo_data.js`.

**With the backend:**
```bash
pip install -r requirements.txt
uvicorn api.main:app --port 8000        # http://127.0.0.1:8000
```
API: `GET /api/health`, `GET /api/results` (measured metrics), `POST /api/analyze/radar` (upload a Sentinel-1 GeoTIFF, get flood polygons as GeoJSON).

**Rebuild the demo data from scratch:**
```bash
python scripts/fetch_m8_chips.py data/sen1floods11     # public bucket, no login
python scripts/build_m8_demo.py data/sen1floods11       # writes eval/results/ and web/demo_data.js
```
Data: Sen1Floods11 hand-labelled chips, Assam (Brahmaputra flood, Sentinel-1 2016-08-12). Engine: `engine/radar.py` (M8).
