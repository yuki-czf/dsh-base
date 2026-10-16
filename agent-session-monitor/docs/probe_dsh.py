import sys, json
import zstandard

path = sys.argv[1]
d = zstandard.ZstdDecompressor()
with open(path, "rb") as f:
    data = d.stream_reader(f).read().decode("utf-8", errors="replace")
lines = data.splitlines()
print("LINES:", len(lines))
print("FIRST:", lines[0][:500])
events = {}
for l in lines:
    try:
        obj = json.loads(l)
    except Exception:
        continue
    t = obj.get("type") or obj.get("event") or "?"
    events[t] = events.get(t, 0) + 1
print("EVENT_TYPES:", json.dumps(events, ensure_ascii=False)[:800])
shown = 0
for l in lines:
    if ("turn/end" in l or "approval/asked" in l) and shown < 6:
        print("EVENT:", l[:260])
        shown += 1
