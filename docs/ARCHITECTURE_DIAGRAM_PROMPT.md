# Architecture Diagram: ChatGPT Prompt

**How to use:**
1. Open ChatGPT (the image-generating model).
2. **Attach your DHRUVA architecture screenshot** as the style reference.
3. Copy everything inside the box below and paste it as your message.
4. If the text comes out garbled, send: "Redraw with the same layout, bigger fonts, and fix the spelling."

---

## THE PROMPT (copy from here)

```
Use the attached image (the DHRUVA architecture diagram) as the STYLE reference: a framed
diagram, a title banner at the top, rounded white cards with bold headings, small icons,
short grey sub-text, and thin arrows between cards.

Now draw a NEW architecture diagram for a different project. Make it a little richer than
the reference, but still clean and easy to read.

=====================================================
FORMAT
=====================================================

- Landscape 16:9, high resolution (at least 3840 x 2160).
- Use a COLOURED background: a soft gradient from light blue to light lavender to light pink.
  Do NOT use a plain white background. Keep the cards white so they stand out.
- Each card has a coloured top border and a small icon or logo.
- Use thin arrows with arrowheads between cards.
- Use large, readable sans-serif text. Keep every label SHORT.
- Spell every label EXACTLY as written below. Do not invent extra boxes.
- Do not draw any database logo (no MongoDB, MySQL or PostgreSQL). This project
  stores results as FILES only.
- Add a small legend in the bottom-right corner:
    green dot  = CORE
    amber dot  = OPTIONAL
    purple dot = GATED (only after the core works)

=====================================================
TITLE BANNER (top centre, yellow-to-pink rounded banner)
=====================================================

Title:     GEOAI 04 - System Architecture
Subtitle:  Change detection that ignores false alarms | FUSION 2026 | Team Slothdev

=====================================================
ROW 1: FOUR CARDS IN A LINE (left to right, with arrows)
=====================================================

Card 1 - "Users"
    icons: laptop + phone
    text:  Officer laptop | Field phone (browser)
           Permalink + QR code, no sign-in

        arrow  -->

Card 2 - "Web app"   [green CORE tag]
    logos: React, Vite, TypeScript, Tailwind CSS, MapLibre
    text:  React | Vite | TypeScript | Tailwind
           MapLibre swipe map | offline PWA | hosted on Vercel
    small dashed amber chip inside:
           OPTIONAL: browser-first engine | ONNX Runtime Web | live sensitivity slider

        two-way arrow  <-->

Card 3 - "Backend API"   [green CORE tag]
    logos: Python, FastAPI, Docker
    text:  FastAPI | Python | Docker
           Jobs | results | exports | review

        arrow  -->

Card 4 - "Storage"
    icon:  folder
    text:  Files, no database
           GeoJSON | GeoPackage | COG | JSON
           Precomputed demo data on the CDN

=====================================================
ROW 2: THREE COLUMNS (left to right, with big arrows between)
=====================================================

---- LEFT COLUMN: "Data sources (free, public)" (teal top border) ----
Six items, each with a small icon:
    1. Sentinel-2           - Copernicus, 10 m optical
    2. Sentinel-1 radar     - Planetary Computer (train), NASA OPERA (test)
    3. OpenStreetMap        - buildings and roads (cached)
    4. ESA WorldCover       - cropland, for impact numbers
    5. Training labels      - OSCD, LEVIR-CD, Sen1Floods11
    6. User upload          - two co-registered GeoTIFFs

---- MIDDLE COLUMN (wider): "GEOAI Engine - Python" (blue top border) ----
Sub-heading: Rasterio | GeoPandas | PyTorch
Five numbered steps stacked top to bottom, joined by small down-arrows:

    1  Ingest and align
       CRS check | resample | histogram match | shift check | data-quality flags

    2  Detect change      [green tag: 5 detectors, auto-routed]
       Draw four green chips and one purple dashed chip inside this step:
         green chip:   Spectral - NDVI / NDBI / NDWI + Otsu
         green chip:   Composites + persistence
         green chip:   Siamese U-Net (trained on OSCD)
         green chip:   BIT transformer (high-res only)
         purple chip:  GATED - M8 radar flood mode (Sentinel-1, works under cloud)

    3  False-alarm filters
       Seasonal rule | cloud/shadow mask | morphology | min area | drop count per rule

    4  Vectorise and attribute
       Rasterio polygons | area m2 | magnitude | centroid | severity tier | reason | confidence

    5  Impact and export
       Hectares | cropland | buildings | roads | GeoPackage | GeoJSON | PDF + QR

    A grey note bar at the bottom of this column:
       Every result carries calibrated confidence + audit.json

---- RIGHT COLUMN: "What the officer gets" (pink top border) ----
Six items, each with a small icon:
    1. Before / after swipe map      - polygons coloured by severity
    2. False-alarm toggle            - raw detections to real changes
    3. Ranked list with a reason     - area, tier, confidence, crops
    4. Impact panel                  - hectares, cropland, buildings, roads
    5. Evidence panel                - held-out metrics + ablation, limits shown
    6. Export and share              - QGIS file, PDF, permalink + QR

=====================================================
ROW 3: ONE WIDE CARD, FIVE SMALL BOXES IN A LINE (amber top border)
=====================================================

Heading: "Train | Evaluate | Ship (offline, build time)"

    Fetch scenes   -->   Train U-Net   -->   Evaluate   -->   Export assets   -->   CI and deploy

    Fetch scenes    - Sentinel-2 and Sentinel-1 demo scenes, OSM, WorldCover cache
    Train U-Net     - OSCD | PyTorch on a Kaggle or Colab GPU
    Evaluate        - held-out cities | 95% confidence intervals | ablation | no-change pair
    Export assets   - static demo files | weights | ONNX (optional)
    CI and deploy   - GitHub Actions tests, then Vercel + API container

Draw one arrow from "Train U-Net" UP to the Engine card (step 2),
and one arrow from "Export assets" UP to the Storage card in Row 1.

=====================================================
EXTRA ARROWS BETWEEN ROWS
=====================================================

- Users --> Web app --> Backend API --> Engine
- Data sources --> Engine --> "What the officer gets"
- Backend API <--> Storage
- Web app also reads Storage directly (static demo files), shown as a thin arrow.

=====================================================
BOTTOM CAPTION (small, bottom-left)
=====================================================

Static-first: the deployed demo works even if the API is offline. No database in v1.
```

---

## Notes (not part of the prompt)

- **Why there is no MongoDB:** this project has no database. Results are files, the browser keeps review state locally, and a database (PostGIS) is only future work.
- **"White" is Vite**, the build tool for the React app.
- **Gated** means the radar flood mode is built into the engine only after the core pipeline works.
- **Check the picture before using it in the PPT:**
  - [ ] No database logo is shown.
  - [ ] "Vite" is spelled correctly.
  - [ ] Radar mode is purple (gated), and browser-first engine is amber (optional).
  - [ ] There are 5 numbered engine steps, with 5 detectors inside step 2.
  - [ ] No Android or Kotlin boxes (the Android app was dropped).
- **Backup:** a hand-built draft of this diagram is at `docs/img/geoai04_architecture.png` (source: `docs/img/architecture.html`). Its icons in the middle and right columns render too small, so treat it only as a layout reference.
