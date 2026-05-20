"""
Targeted CWCVT JS fetch — tries multiple path/header variations.
"""
import subprocess, time, urllib.request, urllib.error, socket, os, re

HOME_SSID  = "Tell My Wi-Fi Lover_EXT"
CWCVT_SSID = "CWCVT-B0:9B:A5"
CWCVT_IP   = "192.168.142.1"
BASE       = f"http://{CWCVT_IP}"
OUT_DIR    = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_assets"
LOG_FILE   = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_fetch_js2.log"

os.makedirs(OUT_DIR, exist_ok=True)
lines = []

def log(s=""):
    print(s)
    lines.append(str(s))
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def wifi_op(ssid=None):
    if ssid:
        subprocess.run(["netsh","wlan","connect",f"name={ssid}"], capture_output=True)
    else:
        subprocess.run(["netsh","wlan","disconnect"], capture_output=True)

def wait_ip(prefix="192.168.142.", secs=20):
    for _ in range(secs*2):
        if prefix in subprocess.run(["ipconfig"],capture_output=True,text=True).stdout:
            return True
        time.sleep(0.5)
    return False

def raw_get(path, headers=None, timeout=10):
    """Returns (status, headers_dict, body_bytes)"""
    url = BASE + path
    h = {"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
    if headers:
        h.update(headers)
    try:
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        body = b""
        try: body = e.read()
        except: pass
        return e.code, dict(e.headers) if hasattr(e,'headers') else {}, body
    except Exception as e:
        return 0, {}, str(e).encode()

# ── CONNECT ───────────────────────────────────────────────────────────────────
log(f"{'='*70}")
log(f"CWCVT JS Fetch v2  —  {time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"{'='*70}\n")
log("[1] Disconnect + connect to CWCVT...")
wifi_op()
time.sleep(2)
wifi_op(CWCVT_SSID)
log(f"    IP: {wait_ip()}")
time.sleep(3)

# ── FULL ROOT HEADERS ──────────────────────────────────────────────────────────
log("\n[2] Full headers from GET /")
s, h, b = raw_get("/")
log(f"    Status: {s}")
for k,v in h.items():
    log(f"    {k}: {v}")
log(f"    Body ({len(b)} bytes):")
log(b.decode("utf-8","replace"))

# ── TRY JS PATHS ──────────────────────────────────────────────────────────────
log("\n[3] Trying JS file paths...")
referer = {"Referer": f"http://{CWCVT_IP}/"}
candidates = [
    ("/main.bundle.js",          {}),
    ("/main.bundle.js",          referer),
    ("/bundle.js",               referer),
    ("/app.js",                  referer),
    ("/app.bundle.js",           referer),
    ("/index.js",                referer),
    ("/js/main.bundle.js",       referer),
    ("/static/main.bundle.js",   referer),
    ("/assets/main.bundle.js",   referer),
    ("/www/main.bundle.js",      referer),
    ("/dist/main.bundle.js",     referer),
    ("/ui/main.bundle.js",       referer),
    ("/web/main.bundle.js",      referer),
]

# Also try raw TCP to see exact response
log("\n[4] Raw TCP GET /main.bundle.js (exact wire bytes):")
try:
    sock = socket.socket()
    sock.settimeout(6)
    sock.connect((CWCVT_IP, 80))
    req = (
        "GET /main.bundle.js HTTP/1.1\r\n"
        f"Host: {CWCVT_IP}\r\n"
        f"Referer: http://{CWCVT_IP}/\r\n"
        "Connection: close\r\n\r\n"
    )
    sock.send(req.encode())
    resp = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk: break
        resp += chunk
    sock.close()
    header_end = resp.find(b"\r\n\r\n")
    if header_end > 0:
        log("  Headers: " + resp[:header_end].decode("utf-8","replace"))
        body_raw = resp[header_end+4:]
        log(f"  Body ({len(body_raw)} bytes): {body_raw[:200]}")
        if len(body_raw) > 100:
            out = os.path.join(OUT_DIR, "main.bundle.js")
            with open(out,"wb") as f: f.write(body_raw)
            log(f"  Saved to {out}")
    else:
        log("  " + resp[:500].decode("utf-8","replace"))
except Exception as e:
    log(f"  Error: {e}")

for path, hdrs in candidates:
    s, h, b = raw_get(path, hdrs)
    ct = h.get("Content-Type","")
    log(f"  {s:3d}  {path:<40} {len(b):>8,}b  {ct[:40]}")
    if s == 200 and len(b) > 500:
        safe = path.strip("/").replace("/","_")
        out = os.path.join(OUT_DIR, safe)
        with open(out,"wb") as f: f.write(b)
        log(f"       -> SAVED {out}")
        # Scan for more paths
        text = b.decode("utf-8","replace")
        log(f"  First 500 chars: {text[:500]}")

# ── ENUMERATE ALL PATHS via directory-style guessing ──────────────────────────
log("\n[5] Broad path scan (looking for any 200)...")
more_paths = [
    "/main.js", "/chunk.js", "/vendor.js", "/runtime.js",
    "/polyfill.js", "/sw.js", "/service-worker.js",
    "/manifest.json", "/manifest.webmanifest",
    "/asset-manifest.json", "/build-manifest.json",
    "/version.json", "/version.txt", "/info.json",
    "/api/v1", "/api/v1/status", "/v1/status",
    "/bacnet/settings", "/bacnet/diagnostics",
    "/mstp/diagnostics", "/mstp/settings",
    "/system/info", "/system/status",
    "/device/info", "/device/settings",
    "/diag/mstp", "/diag/wifi", "/diag/ble",
]
for path in more_paths:
    s, h, b = raw_get(path, referer, timeout=4)
    if s == 200:
        log(f"  200  {path:<40} {len(b):>8,}b  {b[:100].decode('utf-8','replace')[:100]}")
    elif s not in (0, 404):
        log(f"  {s:3d}  {path}")

# ── RECONNECT ─────────────────────────────────────────────────────────────────
log(f"\n[6] Reconnecting to {HOME_SSID}...")
wifi_op()
time.sleep(1)
wifi_op(HOME_SSID)
time.sleep(3)
r = subprocess.run(["netsh","wlan","show","interfaces"],capture_output=True,text=True)
log("    OK." if HOME_SSID in r.stdout else "    WARNING: check Wi-Fi.")
log(f"\nDone: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log("="*70)
