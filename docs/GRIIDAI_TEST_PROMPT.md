# GriidAi test prompt for GEOAI 04 (Slothdevs)

Files to attach (from `geoai_04_slothdev/web/public/demos/<scene>/`):
- `result_raw.geojson` (naive detections) and `result_filtered.geojson` (after the false-alarm filter) for each scene
- `exports/changes.gpkg` for each scene
- Scenes: navi-mumbai-airport, pune-hinjewadi, season-control, assam-flood-2016, delhi-ncr, bengaluru, guwahati

Paste everything below the line into a New Session.

---

You are acting as an independent GIS QA analyst. I am attaching outputs from a change-detection system that compares satellite images from two dates and tries to ignore false alarms (seasonal vegetation, lighting, clouds, radar speckle). For each scene there is a `result_raw.geojson` (naive detections), a `result_filtered.geojson` (after the false-alarm filter) and a GeoPackage export. Test everything you can, and report each test as PASS, FAIL or COULD NOT TEST, with the evidence (numbers, a map, or a table). Do not guess. If a dataset or tool is unavailable, say so.

Scenes and what I expect:
- navi-mumbai-airport: real large construction (airport build-out). Expect many real changes.
- pune-hinjewadi: fast-growing city edge. Expect built-up growth.
- season-control: farmland where NOTHING was built. Expect almost no real changes after filtering.
- assam-flood-2016: radar flood, Brahmaputra. Expect water on floodplain and cropland.
- delhi-ncr, bengaluru, guwahati: regional checks. Known confusers are rivers and sandbars moving (Yamuna, Brahmaputra) and bare soil.

## A. Data integrity (every file)
1. List every layer, feature count, geometry type, CRS and attribute columns with types.
2. Check for invalid, empty, duplicate or self-intersecting geometries; report counts and fix suggestions.
3. Check the CRS is correct for India and the coordinates fall inside the expected area for each scene name.
4. Check area attributes against area you compute yourself in an equal-area projection (for India use EPSG:7755 or the correct UTM zone). Report the maximum and mean difference.
5. Check that GeoJSON and GeoPackage versions of the same scene contain the same features and attributes.
6. Check severity tiers, confidence values and type labels for missing values, out-of-range values and inconsistent spellings.

## B. False-alarm filter effectiveness
7. For every scene: raw count, filtered count, percentage removed, raw and filtered total area (ha).
8. Confirm every filtered feature also exists in the raw file (filtered must be a subset of raw). List any that do not.
9. Describe what the removed features look like compared with the kept ones (size, shape compactness, type, location). State whether the filter looks sensible.
10. season-control: compute filtered detections per km². Say whether it is near zero, and show where any remaining ones are.
11. Chart raw vs filtered counts per scene.

## C. Spatial plausibility against independent data
12. Overlay the filtered polygons on current satellite imagery and OpenStreetMap. Do the changes line up with visible buildings, roads, cleared land or water?
13. For navi-mumbai-airport and pune-hinjewadi, compare with OSM buildings, roads and aeroway or landuse features. Compute the share of the changed area that overlaps built-up or construction land, and how many changes sit on land that looks unchanged.
14. Land cover: intersect with a land cover layer (ESA WorldCover or the best available). Report area per land cover class per scene and sanity-check it (flood scene on cropland and water, season-control on cropland).
15. Elevation and water: for assam-flood-2016 check whether flagged flood areas are low-lying, near the river, and not on permanent water (JRC permanent water if available). Report what fraction is permanent water.
16. For delhi-ncr and guwahati, find detections along rivers or sandbars and say how many are likely false positives from river movement.
17. For bengaluru and any dry-region scene, look for scattered small detections that look like bare soil.
18. Find the 10 largest and 10 smallest filtered polygons per scene and check each visually. Say whether it is plausible.

## D. Spatial statistics
19. Cluster analysis: are changes clustered (hotspots) or random? Use a hotspot or density method and map it.
20. Distance of changes from roads, from existing built-up areas and from water.
21. Compare the size distribution of raw vs filtered polygons.
22. Check for edge or tile-boundary artefacts (straight lines, grid-aligned shapes, strips along the boundary).
23. Neighbourhood or ward summary: changed area per admin unit (district or ward) for each scene, if boundaries are available.

## E. Impact summary
24. Per scene, compute hectares changed and, using land cover, the cropland affected and built-up land affected. I will compare with the system's own numbers, so show the method.
25. Population or settlements near flood or change areas, if Census or population data is available.

## F. Robustness
26. Merge nearby polygons (e.g. within 10 m) and report how the count changes.
27. Sensitivity: apply a minimum area threshold of 0.1, 0.5, 1 and 5 ha and chart how many features survive.
28. Check the scenes against each other for consistency (same attribute schema, same units).

## G. Output
29. A single summary table: scene, raw count, filtered count, % removed, filtered area (ha), plausibility verdict, main concern.
30. A ranked list of the 10 most serious problems found, each with the scene, feature IDs and a map.
31. A list of what you could not test and why, and what extra data would let you test it.
32. Save the workflow so it can be re-run on new scenes, and export the result tables as CSV and maps as images or PDF.

Rules: keep numbers traceable, state every assumption (CRS, datasets, thresholds), and do not claim accuracy figures such as IoU unless I give you ground-truth labels.
