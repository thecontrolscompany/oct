"""
CWCVT Web UI Probe Script
Switches Wi-Fi to CWCVT AP, scrapes all endpoints, reconnects to home network.
Run with: python cwcvt_probe.py
Results saved to cwcvt_probe_results.txt
"""

import subprocess, time, socket, urllib.request, urllib.error, json, os, sys

HOME_SSID   = "Tell My Wi-Fi Lover_EXT"
CWCVT_SSID  = "CWCVT-B0:9B:A5"
CWCVT_IP    = "192.168.142.1"
OUT_FILE    = r"C:\Users\TimothyCollins\dev\cct\hardware\cwcvt_probe_results.txt"

lines = []

def log(s=""):
    print(s)
    lines.append(s)

def save():
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def wifi_connect(ssid):
    subprocess.run(["netsh","wlan","connect",f"name={ssid}"], capture_output=True)

def wifi_disconnect():
    subprocess.run(["netsh","wlan","disconnect"], capture_output=True)

def wait_for_ip(target_prefix, timeout=20):
    for _ in range(timeout * 2):
        try:
            result = subprocess.run(["ipconfig"], capture_output=True, text=True)
            if target_prefix in result.stdout:
                return True
        except:
            pass
        time.sleep(0.5)
    return False

def get(path, timeout=8):
    url = f"http://{CWCVT_IP}{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            headers = dict(r.headers)
            return r.status, headers, body
    except urllib.error.HTTPError as e:
        return e.code, {}, b""
    except Exception as e:
        return None, {}, str(e).encode()

def bacnet_whois():
    """Send BACnet Who-Is broadcast and listen for I-Am responses."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.settimeout(5)
        s.bind(("", 47808))
        # BACnet Who-Is (unconfirmed, all devices, no range limit)
        whois = bytes([
            0x81, 0x0b,       # BVLC type, Original-Broadcast-NPDU
            0x00, 0x0c,       # length = 12
            0x01, 0x20,       # NPDU version 1, broadcast
            0xff, 0xff,       # DNET = 65535 (global broadcast)
            0x00,             # DLEN = 0
            0xff,             # hop count
            0x10, 0x08,       # APDU: unconfirmed, Who-Is
        ])
        s.sendto(whois, ("192.168.142.255", 47808))
        responses = []
        deadline = time.time() + 5
        while time.time() < deadline:
            try:
                data, addr = s.recvfrom(1024)
                responses.append((addr, data.hex()))
            except socket.timeout:
                break
            except:
                pass
        s.close()
        return responses
    except Exception as e:
        return [("error", str(e))]


# ── MAIN ──────────────────────────────────────────────────────────────────────

log("=" * 70)
log("CWCVT Probe Script")
log(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log("=" * 70)
log()

# Step 1: Disconnect from home network
log(f"[1] Disconnecting from {HOME_SSID}...")
wifi_disconnect()
time.sleep(2)
save()

# Step 2: Connect to CWCVT
log(f"[2] Connecting to {CWCVT_SSID}...")
wifi_connect(CWCVT_SSID)

log("[3] Waiting for IP from CWCVT DHCP (192.168.142.x)...")
got_ip = wait_for_ip("192.168.142.", timeout=20)
log(f"    IP acquired: {got_ip}")
if not got_ip:
    log("    WARNING: No IP assigned, probing anyway...")
time.sleep(2)
save()

# Step 3: Probe all HTTP endpoints
log()
log("[4] HTTP endpoint probe")
log("-" * 70)

endpoints = [
    "/",
    "/index.html",
    "/index.htm",
    "/api",
    "/api/status",
    "/api/info",
    "/api/device",
    "/api/diagnostics",
    "/api/settings",
    "/api/bacnet",
    "/api/mstp",
    "/api/wifi",
    "/api/ble",
    "/api/pcap",
    "/bacnet",
    "/settings",
    "/diagnostics",
    "/mstp",
    "/wifi",
    "/ble",
    "/status",
    "/info",
    "/about",
    "/config",
    "/diag",
    "/ws",
    "/static/",
    "/js/",
    "/css/",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
]

for ep in endpoints:
    status, headers, body = get(ep)
    ct = headers.get("Content-Type", "")
    size = len(body) if isinstance(body, bytes) else 0
    if status:
        preview = ""
        if isinstance(body, bytes) and size > 0:
            try:
                text = body.decode("utf-8", errors="replace")[:300]
                preview = " | " + text.replace("\n"," ").replace("\r","")[:200]
            except:
                preview = f" | [binary {size}b]"
        log(f"  {status}  {ep:<35} {ct[:30]}{preview}")
    else:
        log(f"  ERR  {ep:<35} {body.decode(errors='replace')[:80]}")
    save()

# Step 4: Get full root page
log()
log("[5] Full root page content")
log("-" * 70)
status, headers, body = get("/")
if isinstance(body, bytes):
    log(body.decode("utf-8", errors="replace")[:5000])
save()

# Step 5: BACnet Who-Is
log()
log("[6] BACnet Who-Is broadcast")
log("-" * 70)
responses = bacnet_whois()
if responses:
    for addr, hexdata in responses:
        log(f"  From {addr}: {hexdata}")
else:
    log("  No responses")
save()

# Step 6: Port scan key ports
log()
log("[7] Port scan (key ports)")
log("-" * 70)
ports = [80, 443, 8080, 8443, 47808, 4840, 102, 23, 22, 21]
for port in ports:
    try:
        s = socket.socket()
        s.settimeout(2)
        result = s.connect_ex((CWCVT_IP, port))
        s.close()
        status_str = "OPEN" if result == 0 else "closed"
        log(f"  {port:5d}: {status_str}")
    except Exception as e:
        log(f"  {port:5d}: error ({e})")
save()

# Step 7: Try WebSocket upgrade on port 80
log()
log("[8] WebSocket probe on ws://192.168.142.1/")
log("-" * 70)
try:
    import base64, hashlib
    s = socket.socket()
    s.settimeout(5)
    s.connect((CWCVT_IP, 80))
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET / HTTP/1.1\r\n"
        f"Host: {CWCVT_IP}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.send(req.encode())
    resp = s.recv(1024)
    s.close()
    log(resp.decode("utf-8", errors="replace"))
except Exception as e:
    log(f"  Error: {e}")
save()

# Final: Reconnect to home network
log()
log("=" * 70)
log(f"[9] Reconnecting to {HOME_SSID}...")
wifi_connect(HOME_SSID)
time.sleep(3)
reconnect_result = subprocess.run(["netsh","wlan","show","interfaces"],
                                   capture_output=True, text=True)
if HOME_SSID in reconnect_result.stdout:
    log("    Reconnected successfully.")
else:
    log("    WARNING: May not be connected yet — check Wi-Fi manually.")

log()
log(f"Done: {time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"Results saved to: {OUT_FILE}")
log("=" * 70)
save()
print(f"\nResults written to {OUT_FILE}")
