# Demo Script (3 minutes) and Recording Checklist

Use this for the live demo and for the backup video. **Record the video on the deployed site**, once, with a clean browser window.
Every number below is on the site; do not say a number you cannot point to on screen.

---

## Before you start

- [ ] Open the deployed site in a fresh window (zoom 100%, no other tabs). Check the four scenes load.
- [ ] Have the API live (or say "live analysis needs the server" and skip step 7).
- [ ] For step 7, pick a box in advance and run **Check scenes** once, so the archive lookup is warm (it takes about 20 seconds).
- [ ] Screen recorder on, microphone tested, notifications off.

---

## The 3 minutes

| Time | Do | Say |
|---|---|---|
| 0:00 | Home page, four scene cards | "After a flood or a construction boom, agencies compare two satellite images. Most of what changes is not real: crops grow, the sun moves, clouds pass. Naive comparison drowns analysts in false alarms. We built a tool that finds the changes that matter and says why." |
| 0:25 | Open **Navi Mumbai airport**. Drag the swipe handle | "This is a real airport being built. Before on the left, after on the right. Polygons are coloured by how serious the change is." |
| 0:50 | Click the **false-alarm filter** off, then on | "With the filter off there are 2,185 raw detections. With it on, 265 real changes. The filters remove cloud, seasonal crop change, speckle and tiny specks, and the app counts what each removed." |
| 1:15 | Click the top polygon. Show the reason and the before/after crops | "Every change explains itself: its area, how sure we are, and why it was kept. Confirm or dismiss it." Click **Confirm**. |
| 1:35 | Show the **Impact** panel | "Hectares changed, cropland and built-up land affected, each with its source. Where we do not know, it says unknown, never zero." |
| 1:50 | Open **Assam flood (radar)** | "Floods happen in the monsoon, when clouds block normal satellites. Radar sees through cloud. This is real radar data from the 2016 Brahmaputra flood, compared with expert-drawn flood maps." Point at the accuracy table. "It is open-water flood extent from one date; flooded crops and streets can be missed." |
| 2:15 | **Export**: download the GeoPackage; show the PDF with its QR code | "Everything exports to QGIS, with a one-page report. The QR code opens this exact view on a phone." |
| 2:30 | **Analyse, Draw an area**. Jump to a city, draw a box, **Check scenes** | "It is not only these four places. Draw a box anywhere in India, choose two dates, and the server finds the two clearest satellite images." Show the table (dates, cloud percentage). |
| 2:50 | **Accuracy** page, then **About** (tech stack) | "Every number on this site comes from a results file. We say what we have measured and what we have not." Show the stack table with "Used now" and "In progress". |
| 3:00 | End on the Accuracy page | "The point is not to detect something. It is to tell you which detections are real, why, and how sure we are." |

---

## If something fails on stage

| Problem | What to do |
|---|---|
| The API is asleep or down | Skip step 7. Say: "live analysis runs on a server that is offline right now; the demo scenes are precomputed and work without it." |
| No internet | The site works offline after one visit (look for the "Offline" badge). Skip step 7. |
| Basemap tiles are blank | The satellite images still show; the basemap only sits underneath. Carry on. |
| A judge asks "does it work everywhere in India?" | "The engine works on any Sentinel-2 pair and you can analyse any box. We have checked six regions so far and will say exactly how many; thresholds were tuned on Maharashtra, so we do not claim it works everywhere." |

---

## Honesty lines (use them; they build trust)

- "The radar number is single-date and from a 2016 event."
- "The 0.41 flood score is the demo scene; the held-out scores are 0.697 on an unseen country and 0.571 on India test chips."
- "We have not yet measured optical accuracy against labels. That is the OSCD model we are training now."
- "The extra filters are off by default: in our test they cut false detections by 27% on a control area, but also removed about 15% of real changed area."

---

## Recording checklist

- [ ] One continuous take under 3:30, or two takes joined at a scene change.
- [ ] The URL bar is visible at the start (shows it is the live site).
- [ ] No private tabs, tokens or file paths on screen.
- [ ] Export the video as MP4 (1080p), under 100 MB; add its link to the README.
