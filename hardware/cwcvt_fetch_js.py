"""
Fetch main.bundle.js from CWCVT and save locally.
Also tries to discover any other JS/asset files referenced inside it.
"""

import subprocess, time, urllib.request, os, re

HOME_SSID  = "Tell My Wi-Fi Lover_EXT"
CWCVT_SSID = "CWCVT-B0:9B:A5"
CWCVT_IP   = "192.168.142.1"
OUT_DIR    = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_assets"
LOG_FILE   = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_fetch_js.log"

os.makedirs(OUT_DIR, exist_ok=True)
log_lines = []

def log(s=""):
    print(s)
    log_lines.append(s)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))

def wifi_connect(ssid):
    subprocess.run(["netsh","wlan","connect",f"name={ssid}"], capture_output=True)

def wifi_disconnect():
    subprocess.run(["netsh","wlan","disconnect"], capture_output=True)

def wait_for_ip(prefix="192.168.142.", timeout=20):
    for _ in range(timeout * 2):
        r = subprocess.run(["ipconfig"], capture_output=True, text=True)
        if prefix in r.stdout:
            return True
        time.sleep(0.5)
    return False

def fetch(path, binary=False, timeout=15):
    url = f"http://{CWCVT_IP}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            return r.status, data
    except Exception as e:
        return None, str(e).encode()

log("=" * 70)
log(f"CWCVT JS Fetch  —  {time.strftime('%Y-%m-%d %H:%M:%S')}")
log("=" * 70)

# Connect
log(f"\n[1] Disconnecting from {HOME_SSID}...")
wifi_disconnect()
time.sleep(2)

log(f"[2] Connecting to {CWCVT_SSID}...")
wifi_connect(CWCVT_SSID)
got_ip = wait_for_ip()
log(f"    IP acquired: {got_ip}")
time.sleep(2)

# Fetch main.bundle.js
log("\n[3] Fetching /main.bundle.js ...")
status, data = fetch("/main.bundle.js")
log(f"    Status: {status}, Size: {len(data):,} bytes")

if status == 200:
    out = os.path.join(OUT_DIR, "main.bundle.js")
    with open(out, "wb") as f:
        f.write(data)
    log(f"    Saved: {out}")

    # Extract referenced assets/URLs from the JS
    text = data.decode("utf-8", errors="replace")
    log("\n[4] Scanning bundle for API routes and asset references...")

    # Find fetch/XHR URLs
    api_patterns = re.findall(r'["\']/([\w/.-]{3,60})["\']', text)
    unique_paths = sorted(set("/" + p for p in api_patterns if "." in p or "/" in p))
    log(f"    Found {len(unique_paths)} candidate paths in bundle")

    # Try fetching each unique path
    log("\n[5] Probing paths found in bundle...")
    for path in unique_paths[:60]:
        s2, d2 = fetch(path, timeout=5)
        size2 = len(d2) if isinstance(d2, bytes) else 0
        if s2 == 200:
            # Save it
            safe = path.strip("/").replace("/", "_")
            ext = os.path.splitext(path)[1] or ".bin"
            out2 = os.path.join(OUT_DIR, safe)
            with open(out2, "wb") as f:
                f.write(d2)
            log(f"    200  {path:<40} {size2:>8,}b  -> saved")
        elif s2:
            log(f"    {s2}   {path:<40} {size2:>8,}b")

    # Print first 3000 chars of the JS for immediate analysis
    log("\n[6] First 3000 chars of main.bundle.js:")
    log("-" * 70)
    log(text[:3000])
    log("\n[7] Searching for interesting strings in bundle...")
    log("-" * 70)

    # Look for API endpoints, URLs, settings keys
    for pattern, label in [
        (r'fetch\s*\(\s*["\']([^"\']+)["\']', "fetch() calls"),
        (r'url\s*[=:]\s*["\']([^"\']{5,60})["\']', "url= assignments"),
        (r'["\']/(api|bacnet|mstp|wifi|ble|settings|diag)[^"\']*["\']', "API-like paths"),
        (r'websocket|WebSocket|ws://', "WebSocket refs"),
        (r'192\.168\.\d+\.\d+', "IP addresses"),
        (r'47808|65001|10001|39845', "BACnet port/network/device numbers"),
        (r'["\']([A-Za-z_][A-Za-z0-9_]{3,30})\s*["\']:\s*["\']', "JSON-like keys"),
    ]:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            log(f"\n  {label} ({len(matches)} found):")
            for m in sorted(set(matches))[:20]:
                log(f"    {m}")

else:
    log(f"    FAILED to fetch main.bundle.js: {data.decode(errors='replace')[:200]}")

# Reconnect
log(f"\n[8] Reconnecting to {HOME_SSID}...")
wifi_disconnect()
time.sleep(1)
wifi_connect(HOME_SSID)
time.sleep(3)
r = subprocess.run(["netsh","wlan","show","interfaces"], capture_output=True, text=True)
log("    Reconnected." if HOME_SSID in r.stdout else "    WARNING: check Wi-Fi manually.")

log(f"\nDone: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log("=" * 70)
