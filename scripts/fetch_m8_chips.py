"""Download the Sen1Floods11 India hand-labelled chips (public bucket, no login).

python scripts/fetch_m8_chips.py DATA_DIR
"""
import json
import os
import sys
import urllib.request

BASE = "https://storage.googleapis.com"
OUT = sys.argv[1]
DEMO = ["India_747992", "India_804466", "India_1050276", "India_383430", "India_500266", "India_1018327", "India_773682"]
for layer in ("S1Hand", "LabelHand", "JRCWaterHand"):
    os.makedirs(f"{OUT}/{layer}", exist_ok=True)
    q = f"{BASE}/storage/v1/b/sen1floods11/o?prefix=v1.1/data/flood_events/HandLabeled/{layer}/India&maxResults=500"
    for item in json.load(urllib.request.urlopen(q))["items"]:
        urllib.request.urlretrieve(f"{BASE}/sen1floods11/{item['name']}", f"{OUT}/{layer}/{os.path.basename(item['name'])}")
os.makedirs(f"{OUT}/S2Hand", exist_ok=True)
for c in DEMO:
    urllib.request.urlretrieve(f"{BASE}/sen1floods11/v1.1/data/flood_events/HandLabeled/S2Hand/{c}_S2Hand.tif", f"{OUT}/S2Hand/{c}_S2Hand.tif")
print("done:", OUT)
