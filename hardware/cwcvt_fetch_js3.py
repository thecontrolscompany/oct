"""
CWCVT JS deep probe — find where main.bundle.js actually lives.
"""
import subprocess, time, socket, os, gzip, zlib

HOME_SSID  = "Tell My Wi-Fi Lover_EXT"
CWCVT_SSID = "CWCVT-B0:9B:A5"
CWCVT_IP   = "192.168.142.1"
OUT_DIR    = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_assets"
LOG_FILE   = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_fetch_js3.log"

os.makedirs(OUT_DIR, exist_ok=True)
lines = []

def log(s=""):
    print(s)
    lines.append(str(s))
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def wifi_op(ssid=None):
    if ssid:
        subprocess.run(["netsh","wlan","connect",f"name={ssid}"],capture_output=True)
    else:
        subprocess.run(["netsh","wlan","disconnect"],capture_output=True)

def wait_ip(prefix="192.168.142.", secs=20):
    for _ in range(secs*2):
        if prefix in subprocess.run(["ipconfig"],capture_output=True,text=True).stdout:
            return True
        time.sleep(0.5)
    return False

def tcp_get(path, extra_headers=None, timeout=10):
    """Raw TCP HTTP GET, returns (status_line, headers_dict, body_bytes)"""
    hdrs = {
        "Host": CWCVT_IP,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Referer": f"http://{CWCVT_IP}/",
        "Connection": "close",
    }
    if extra_headers:
        hdrs.update(extra_headers)
    req = f"GET {path} HTTP/1.1\r\n"
    for k,v in hdrs.items():
        req += f"{k}: {v}\r\n"
    req += "\r\n"
    try:
        s = socket.socket()
        s.settimeout(timeout)
        s.connect((CWCVT_IP, 80))
        s.send(req.encode())
        data = b""
        while True:
            chunk = s.recv(8192)
            if not chunk: break
            data += chunk
            if len(data) > 2_000_000: break
        s.close()
    except Exception as e:
        return f"ERR:{e}", {}, b""

    sep = data.find(b"\r\n\r\n")
    if sep < 0:
        return "NO_SEP", {}, data

    header_block = data[:sep].decode("utf-8","replace")
    body = data[sep+4:]

    lines_h = header_block.split("\r\n")
    status_line = lines_h[0] if lines_h else ""
    hdict = {}
    for l in lines_h[1:]:
        if ":" in l:
            k,_,v = l.partition(":")
            hdict[k.strip().lower()] = v.strip()

    # Decompress if needed
    enc = hdict.get("content-encoding","")
    if enc == "gzip":
        try: body = gzip.decompress(body)
        except: pass
    elif enc in ("deflate","zlib"):
        try: body = zlib.decompress(body)
        except: pass

    return status_line, hdict, body

def probe(path, label=None, save=True, extra_headers=None):
    status, h, body = tcp_get(path, extra_headers)
    ct = h.get("content-type","")
    size = len(body)
    tag = label or path
    log(f"  {status[:20]:<22} {tag:<45} {size:>8,}b  {ct[:35]}")
    if "200" in status and size > 200 and save:
        safe = path.strip("/").replace("/","_") or "root"
        out = os.path.join(OUT_DIR, safe + ("" if "." in safe else ".bin"))
        with open(out,"wb") as f: f.write(body)
        log(f"    -> SAVED {out}")
        preview = body[:300].decode("utf-8","replace") if ct.startswith("text") or ct == "" else f"[binary {size}b]"
        log(f"    -> {preview[:200]}")
    return status, h, body

# ── CONNECT ───────────────────────────────────────────────────────────────────
log(f"{'='*70}")
log(f"CWCVT JS Probe v3  —  {time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"{'='*70}\n")
log("[1] Connecting to CWCVT...")
wifi_op()
time.sleep(2)
wifi_op(CWCVT_SSID)
log(f"    IP: {wait_ip()}")
time.sleep(3)

# Test 1: Is root a catch-all?
log("\n[2] Catch-all test")
probe("/thispathdoesnotexist_xyz_abc", "fake path")
probe("/ui/", "/ui/ dir")
probe("/ui/main.bundle.js", "/ui/main.bundle.js")

# Test 2: Full browser UA with encoding for main paths
log("\n[3] Full browser headers on JS paths")
for path in ["/main.bundle.js", "/main.bundle.js.gz", "/main.bundle.js.br",
             "/js.gz", "/bundle.gz", "/app.gz"]:
    probe(path)

# Test 3: Maybe it's served with a query string or hash
log("\n[4] Query string / fragment variations")
for path in ["/main.bundle.js?v=1", "/main.bundle.js?1.1.0.371",
             "/?js=1", "/index?bundle=main"]:
    probe(path)

# Test 4: HTTP/1.0 (some embedded servers behave differently)
log("\n[5] HTTP/1.0 request")
try:
    s = socket.socket(); s.settimeout(8)
    s.connect((CWCVT_IP, 80))
    s.send(b"GET /main.bundle.js HTTP/1.0\r\nHost: 192.168.142.1\r\n\r\n")
    r = b""
    while True:
        c = s.recv(4096)
        if not c: break
        r += c
    s.close()
    log(f"  HTTP/1.0 response: {r[:300].decode('utf-8','replace')}")
except Exception as e:
    log(f"  Error: {e}")

# Test 5: OPTIONS to discover allowed methods / server info
log("\n[6] OPTIONS request (server fingerprint)")
try:
    s = socket.socket(); s.settimeout(8)
    s.connect((CWCVT_IP, 80))
    s.send(b"OPTIONS / HTTP/1.1\r\nHost: 192.168.142.1\r\n\r\n")
    r = b""
    while True:
        c = s.recv(4096)
        if not c: break
        r += c
    s.close()
    log(r.decode("utf-8","replace")[:500])
except Exception as e:
    log(f"  Error: {e}")

# Test 6: Enumerate more paths systematically
log("\n[7] Expanded path scan")
scan_paths = [
    "/api/v1/", "/api/v2/",
    "/api/settings/bacnet", "/api/settings/mstp", "/api/settings/wifi",
    "/api/settings/ble", "/api/diagnostics/mstp", "/api/diagnostics/device",
    "/api/diagnostics/wifi", "/api/diagnostics/ble",
    "/api/capture", "/api/pcap/start", "/api/pcap/stop", "/api/pcap/status",
    "/api/factory-reset", "/api/reboot",
    "/bacnet/settings", "/bacnet/diagnostics",
    "/settings/bacnet", "/settings/mstp",
    "/diag/mstp", "/diag/wifi", "/diag/ble", "/diag/device",
    "/sys/info", "/sys/status",
]
for p in scan_paths:
    probe(p)

# ── RECONNECT ─────────────────────────────────────────────────────────────────
log(f"\n[8] Reconnecting to {HOME_SSID}...")
wifi_op()
time.sleep(1)
wifi_op(HOME_SSID)
time.sleep(3)
r = subprocess.run(["netsh","wlan","show","interfaces"],capture_output=True,text=True)
log("    OK." if HOME_SSID in r.stdout else "    WARNING.")
log(f"\nDone: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log("="*70)
