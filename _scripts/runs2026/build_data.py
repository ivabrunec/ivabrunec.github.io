"""Build assets/runs2026/data.json from Strava runs and an OpenStreetMap underlay.

Usage: python3 _scripts/runs2026/build_data.py [--skip-underlay]

--skip-underlay builds without the shoreline/street map if it isn't cached yet
(Overpass is often overloaded).

Reads Strava credentials from ~/Documents/strava_sync (.env + strava_tokens.json).
GPS streams and OSM downloads are cached in ~/Documents/strava_sync/cache, so a
rerun only fetches activities it hasn't seen.
"""

import json
import math
import os
import sys
import time
from datetime import datetime

import requests

STRAVA_DIR = os.path.expanduser("~/Documents/strava_sync")
TOKEN_FILE = os.path.join(STRAVA_DIR, "strava_tokens.json")
CACHE = os.path.join(STRAVA_DIR, "cache")
STREAMS = os.path.join(CACHE, "streams")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "assets", "runs2026", "data.json")

START = datetime(2025, 10, 1)
RACE_DATE = "2026-10-18"
GTA = (43.3, 44.1, -80.1, -78.9)
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = {"User-Agent": "ivabrunec-runs2026/1.0 (personal data-viz project)"}


def env():
    with open(os.path.join(STRAVA_DIR, ".env")) as f:
        return dict(line.strip().split("=", 1) for line in f if "=" in line)


def access_token():
    tokens = json.load(open(TOKEN_FILE))
    if tokens["expires_at"] > time.time() + 60:
        return tokens["access_token"]
    e = env()
    r = requests.post("https://www.strava.com/oauth/token", data={
        "client_id": e["STRAVA_CLIENT_ID"], "client_secret": e["STRAVA_CLIENT_SECRET"],
        "grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]})
    r.raise_for_status()
    json.dump(r.json(), open(TOKEN_FILE, "w"), indent=2)
    return r.json()["access_token"]


def strava_get(url, token, **params):
    while True:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=params)
        if r.status_code != 429:
            return r
        wait = 900 - (time.time() % 900) + 5  # limits reset on the quarter hour
        print(f"  rate limited, sleeping {wait:.0f}s", flush=True)
        time.sleep(wait)


def fetch_runs():
    os.makedirs(STREAMS, exist_ok=True)
    token = access_token()
    acts, page = [], 1
    while True:
        batch = strava_get("https://www.strava.com/api/v3/athlete/activities", token,
                           per_page=200, page=page, after=int(START.timestamp())).json()
        if not batch:
            break
        acts += [a for a in batch if a.get("type") == "Run" or a.get("sport_type") in ("Run", "TrailRun")]
        page += 1
    acts.sort(key=lambda a: a["start_date"])
    runs = []
    for a in acts:
        path = os.path.join(STREAMS, f"{a['id']}.json")
        if os.path.exists(path):
            latlng = json.load(open(path))
        else:
            r = strava_get(f"https://www.strava.com/api/v3/activities/{a['id']}/streams", token,
                           keys="latlng", key_type="latlng")
            latlng = next((s["data"] for s in r.json() if s.get("type") == "latlng"), []) if r.ok else []
            json.dump(latlng, open(path, "w"))
            print(f"  fetched {a['start_date_local'][:10]} {a['name']}", flush=True)
        runs.append({"date": a["start_date_local"][:10], "km": a["distance"] / 1000, "latlng": latlng})
    return runs


def overpass(name, query):
    path = os.path.join(CACHE, f"osm_{name}.json")
    if os.path.exists(path):
        return json.load(open(path))
    if "--skip-underlay" in sys.argv:
        print(f"  no cached {name} underlay; skipping", flush=True)
        return {"elements": []}
    for attempt in range(12):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = requests.post(url, data={"data": query}, headers=UA, timeout=240)
            if r.ok and r.text.lstrip().startswith("{") and r.json().get("elements"):
                json.dump(r.json(), open(path, "w"))
                return r.json()
            print(f"  overpass {name}: HTTP {r.status_code} from {url}", flush=True)
        except requests.RequestException as e:
            print(f"  overpass {name}: {type(e).__name__} from {url}", flush=True)
        time.sleep(15 * (attempt + 1))
    raise RuntimeError(f"Overpass unavailable for {name}; try again later")


def rdp(pts, eps):
    if len(pts) <= 2:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        if dx == 0 and dy == 0:
            d = math.hypot(x0 - x1, y0 - y1)
        else:
            t = max(0.0, min(1.0, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
            d = math.hypot(x0 - (x1 + t * dx), y0 - (y1 + t * dy))
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def main():
    runs = fetch_runs()
    gta = [r for r in runs if len(r["latlng"]) > 1 and
           GTA[0] <= r["latlng"][len(r["latlng"]) // 2][0] <= GTA[1] and
           GTA[2] <= r["latlng"][len(r["latlng"]) // 2][1] <= GTA[3]]

    lats = [p[0] for r in gta for p in r["latlng"]]
    lngs = [p[1] for r in gta for p in r["latlng"]]
    lat0, lng0 = (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2
    kx, ky = math.cos(math.radians(lat0)) * 111320, 110574

    def xy(lat, lng):
        return [(lng - lng0) * kx, (lat0 - lat) * ky]

    def ints(line):
        return [[round(x), round(y)] for x, y in line]

    training, cum = 0.0, {}
    for r in runs:
        if r["date"] < RACE_DATE:
            training += r["km"]
        cum[id(r)] = training

    out_runs = []
    for r in gta:
        race = r["date"] == RACE_DATE and r["km"] > 40
        line = rdp([xy(la, ln) for la, ln in r["latlng"]], 5)
        out_runs.append({"d": r["date"].replace("-", ""), "k": round(r["km"], 1), "t": round(cum[id(r)], 1),
                         "m": int(race), "p": ints(line)})

    pad = 0.035
    bbox = f"{min(lats) - pad:.3f},{min(lngs) - pad * 1.4:.3f},{max(lats) + pad:.3f},{max(lngs) + pad * 1.4:.3f}"
    lake = overpass("lake", f'[out:json][timeout:180];rel["name"="Lake Ontario"]["natural"="water"];way(r)({bbox});out geom;')
    roads = overpass("roads", f'[out:json][timeout:180];way["highway"~"^(trunk|primary|secondary)$"]({bbox});out geom;')

    def ways(d, keep=lambda w: True, eps=12):
        lines = []
        for w in d["elements"]:
            g = w.get("geometry")
            if g and keep(w):
                line = ints(rdp([xy(p["lat"], p["lon"]) for p in g], eps))
                if len(line) > 1:
                    lines.append(line)
        return lines

    data = {
        "meta": {
            "training_km": round(training, 1),
            "race": RACE_DATE.replace("-", ""),
            "first": out_runs[0]["d"],
            "last": out_runs[-1]["d"],
        },
        "runs": out_runs,
        "lake": ways(lake, eps=10),
        "roads": ways(roads, keep=lambda w: w.get("tags", {}).get("highway") in ("trunk", "primary"), eps=15),
        "streets": ways(roads, keep=lambda w: w.get("tags", {}).get("highway") == "secondary", eps=15),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{len(out_runs)} runs, {len(data['lake'])} shoreline lines, "
          f"{len(data['roads'])} arterial + {len(data['streets'])} street lines, "
          f"training {data['meta']['training_km']} km -> {os.path.relpath(OUT, REPO)} "
          f"({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
