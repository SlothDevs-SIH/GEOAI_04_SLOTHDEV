# GEOAI 04: voice-over script for the demo video and the eight shorts

The videos have no audio. The text on screen is a caption; the lines below are what to say. Times are approximate (the demo is about 3:04). Speak slowly: about 130 words a minute fits. Re-record with `web/video/demo.mjs` and `web/video/shorts.mjs` if the site changes (see the bottom).

## 3-minute demo (landscape)

| Time | On screen | Say |
|---|---|---|
| 0:00 | Title card | "Satellites photograph the same place again and again. Comparing two images should tell you what changed. It rarely does: most of what moves is not real change. GEOAI 04 finds the changes that matter." |
| 0:07 | The scenes page | "Here are nine real places across India. Each one is a before and an after satellite image, analysed in advance." |
| 0:20 | Assam flood, 2016 | "Assam, August 2016, a monsoon flood. Cloud hides the ground from normal cameras, so we use Sentinel-1 radar, which sees through cloud. Drag the divider to compare before and after." |
| 0:40 | Filter off, then on | "With the filter off, the computer finds 3,490 candidates. Radar speckle, shadows and rivers all look like change. Switch the false-alarm filter on and 37 real flood areas remain." |
| 0:52 | Expert labels | "We can lay the expert hand-drawn flood map on top, to check against the truth." |
| 1:00 | Navi Mumbai airport | "Navi Mumbai airport, a huge construction project. 2,185 raw detections become 265 real changes. Each one is ranked: critical, high, medium, low, with a different shape for each, so it never depends on colour alone." |
| 1:15 | One change selected | "Pick a change and you get its size, how confident we are, and a reason in plain language, not a score." |
| 1:30 | Confirm, then Impact | "A reviewer confirms or dismisses each change, and the choice is remembered. The impact panel adds up the area changed, and how much cropland and built-up land is affected." |
| 1:40 | Season control | "Now the honest test: farmland with no new buildings. The raw comparison finds 3,083 candidates. We keep 22. Crops growing and the sun moving are not change." |
| 1:50 | Guwahati | "In Guwahati a river sandbar moved. The tool does not call that encroachment. It says what it is." |
| 2:00 | Sensitivity lab | "The sensitivity lab lets anyone drag the threshold and watch detections appear and vanish, live, in the browser, with no server." |
| 2:20 | Accuracy page | "Every number on this page comes from a script anyone can rerun, with 95% intervals. On held-out cities, a naive comparison scores 0.24, our rule-based engine 0.38, and the learned model 0.54 F1." |
| 2:35 | LEVIR | "In high-resolution mode we reproduce the published result: 0.90 F1 on the LEVIR-CD test set." |
| 2:42 | Not measured | "And the page lists, in plain words, what we have not measured yet." |
| 2:48 | Save for offline | "A scene can be saved for offline use. A first visit downloads under five megabytes, so it works on a weak phone." |
| 2:56 | Closing card | "Not every pixel that moved. Only what really changed. GEOAI 04, from Team Slothdevs." |

## Eight shorts (vertical, 14 to 22 seconds each)

1. **3,490 → 37** (Assam flood): "3,490 detections. 37 real flood areas. That is the false-alarm filter at work."
2. **Floods, through cloud**: "Monsoon cloud hides the ground. Radar sees through it. Drag to compare before and after, then check it against the expert labels."
3. **New construction, ranked** (Navi Mumbai): "Navi Mumbai airport: 2,185 detections, 265 real changes. Swipe to see the same place before and after."
4. **Every change is explained**: "Tap a change. You get its priority, size, confidence and a plain-language reason. Confirm it or dismiss it."
5. **The honest test** (farmland): "Farmland with no new buildings: 3,083 candidates, 22 kept. Crops and shadows are not change."
6. **Not every change is encroachment** (Guwahati): "A river sandbar moved. That is not a building, and the tool says so."
7. **Live sensitivity lab**: "Drag a slider and the detections change instantly, computed in your browser."
8. **Numbers you can rerun** (accuracy): "Naive 0.24, rules 0.38, learned 0.54 F1, with 95% intervals. The published high-resolution result is reproduced at 0.90."

## What to be careful about when speaking
- Say "raw detections" and "real changes", not "accuracy", for the 3,490 → 37 style counts. They are counts, not scores.
- The 0.24 / 0.38 / 0.54 F1 are on 10 held-out OSCD test cities, with overlapping intervals: say "better on average", not "clearly better".
- The demo scenes are precomputed ("Demo data" badge). Live analysis of a new area needs the analysis server and is not shown.
- The map background is plain grey in these recordings because street-map tiles were not reachable where they were recorded. The satellite scenes are real.

## Re-recording
```bash
cd web && npm run build && npx vite preview --port 4173 &
node video/demo.mjs  /tmp/video/demo        # about 3 minutes, real time
node video/shorts.mjs /tmp/video/shorts      # eight clips; add a number (1-8) to record one
ffmpeg -i <clip>.webm -c:v libx264 -crf 20 -pix_fmt yuv420p -an out.mp4
```
