export default function OverviewPane() {
  return (
    <>
      <div className="ov-hero">
        <div className="ov-hero-kicker">Open Source BACnet MS/TP Wireless Converter</div>
        <h1>OSCVT</h1>
        <p>
          OSCVT is an open-source ESP32-S3 device that replaces the Johnson Controls TL-CWCVT-0
          ($500) and TL-MAP1810-0Px ($600+) — two proprietary adapters that field technicians rely
          on to commission and troubleshoot BACnet MS/TP networks. OSCVT delivers the same
          BACnet MS/TP to BACnet/IP routing with auto-baud detection, auto-polarity correction,
          and a live web UI, at a fraction of the cost and with full visibility into the hardware
          and firmware.
        </p>
        <p>
          OSCVT works alongside OCT. The device provides the live BACnet transport; OCT provides
          the software. Together they replace the full CCT + CWCVT field stack.
        </p>
        <div className="ov-hero-chips">
          <span className="ov-chip">Replaces TL-CWCVT-0</span>
          <span className="ov-chip">ESP32-S3</span>
          <span className="ov-chip">BACnet MS/TP ↔ BACnet/IP</span>
          <span className="ov-chip">Auto-baud</span>
          <span className="ov-chip">Auto-polarity</span>
          <span className="ov-chip">Open source</span>
        </div>
      </div>

      <div className="ov-feature-grid">
        <FeatureCard icon="⇄" title="BACnet MS/TP ↔ BACnet/IP Routing"
          body="Full bidirectional router. Who-Is from BACnet/IP is forwarded to the MS/TP bus; I-Am replies come back through. Read, write, and subscribe to any object on the bus from a laptop or OCT." />
        <FeatureCard icon="⟳" title="Auto-Baud Detection"
          body="Passively listens to the bus before joining. Detects baud rate from token preamble timing (9600, 19200, 38400, 76800, 115200 bps) and locks in automatically. No manual configuration needed." />
        <FeatureCard icon="↕" title="Auto-Polarity Correction"
          body="Detects RS-485 A/B wire orientation at startup using ESP32 UART invert mode. No hardware relays. Reports corrected polarity to the technician on-screen and in reports." />
        <FeatureCard icon="◈" title="Live Diagnostics"
          body="Token loop time, framing errors, dropped tokens, per-device response times, and APDU rates — all visible in real time from the device web UI or from OCT." />
        <FeatureCard icon="📄" title="Field Reports"
          body="Structured JSON reports include bus protocol, baud, polarity, EOL status, device inventory, and technician notes. Exported to SD card and optionally pushed to ProjectHub." />
        <FeatureCard icon="⬆" title="OTA Firmware Updates"
          body="Flash new firmware directly from the device web UI or from this portal. No USB cable required after initial flash. Firmware is verified before the device reboots." />
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Comparison — OSCVT vs TL-CWCVT-0</div>
        <div className="ov-card-body" style={{ padding: 0 }}>
          <table className="ov-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>TL-CWCVT-0</th>
                <th>OSCVT Pro</th>
                <th>OSCVT Mini</th>
              </tr>
            </thead>
            <tbody>
              <CompRow feature="BACnet MS/TP routing"    cwcvt="✓"  pro="✓"  mini="✓" />
              <CompRow feature="BACnet/IP routing"        cwcvt="✓"  pro="✓"  mini="✓" />
              <CompRow feature="Auto-baud detection"      cwcvt="✓"  pro="✓"  mini="✓" />
              <CompRow feature="Auto-polarity correction" cwcvt="—"  pro="✓"  mini="✓" />
              <CompRow feature="Touchscreen display"      cwcvt="—"  pro={'4.3" IPS'} mini="—" />
              <CompRow feature="SD card + PCAP capture"  cwcvt="—"  pro="✓"  mini="—" />
              <CompRow feature="RTC (timestamped reports)"cwcvt="—"  pro="✓"  mini="—" />
              <CompRow feature="USB-C OTG (IP trunk scan)"cwcvt="—"  pro="Planned" mini="—" />
              <CompRow feature="Modbus RTU"               cwcvt="—"  pro="Planned" mini="Planned" />
              <CompRow feature="DIN rail mount"           cwcvt="—"  pro="—"  mini="✓" />
              <CompRow feature="LiPo battery"             cwcvt="—"  pro="✓"  mini="—" />
              <CompRow feature="Price"                    cwcvt="$500" pro="~$45 + enclosure" mini="~$17 + DIN rail" />
              <CompRow feature="Open source"              cwcvt="—"  pro="✓"  mini="✓" />
            </tbody>
          </table>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Project Status</div>
        <div className="ov-card-body">
          <table className="ov-table">
            <thead><tr><th>Milestone</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Hardware specification</td><td style={{ color: '#166534', fontWeight: 600 }}>Complete</td><td>Pro and Mini boards selected</td></tr>
              <tr><td>Pro hardware (Waveshare 4.3B)</td><td style={{ color: '#92400e', fontWeight: 600 }}>Incoming</td><td>Board ordered</td></tr>
              <tr><td>Firmware — 1a: BACnet routing</td><td style={{ color: '#1e40af', fontWeight: 600 }}>Planned</td><td>bacnet-stack (Steve Karg)</td></tr>
              <tr><td>Firmware — 1b: Diagnostics + reports</td><td style={{ color: '#1e40af', fontWeight: 600 }}>Planned</td><td>Depends on 1a</td></tr>
              <tr><td>Firmware — 1c: Modbus + N2</td><td style={{ color: '#1e40af', fontWeight: 600 }}>Planned</td><td>Depends on 1b</td></tr>
              <tr><td>OCT integration</td><td style={{ color: '#166534', fontWeight: 600 }}>Active</td><td>Live device proxy live at /api/router</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="ov-feature-card">
      <div className="ov-feature-icon">{icon}</div>
      <div className="ov-feature-title">{title}</div>
      <div className="ov-feature-body">{body}</div>
    </div>
  );
}

function CompRow({ feature, cwcvt, pro, mini }: { feature: string; cwcvt: string; pro: string; mini: string }) {
  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{feature}</td>
      <td className="dim">{cwcvt}</td>
      <td style={{ color: pro.startsWith('✓') ? '#166534' : undefined, fontWeight: pro.startsWith('✓') ? 600 : undefined }}>{pro}</td>
      <td style={{ color: mini.startsWith('✓') ? '#166534' : undefined, fontWeight: mini.startsWith('✓') ? 600 : undefined }}>{mini}</td>
    </tr>
  );
}
