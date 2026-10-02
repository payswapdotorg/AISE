import sys
sys.argv = ["x"]
exec(open("fetch_tiles.py").read().replace('LAT_MIN, LAT_MAX = 39.0, 41.0', 'LAT_MIN, LAT_MAX = 38.0, 38.55').replace('LON_MIN, LON_MAX = -102.10, -100.75', 'LON_MIN, LON_MAX = -101.15, -100.35').replace('fetch-log.json', 'fetch-log-finney.json'))
