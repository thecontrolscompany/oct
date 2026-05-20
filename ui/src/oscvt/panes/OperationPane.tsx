export default function OperationPane() {
  return (
    <>
      <div className="ov-card">
        <div className="ov-card-header">Physical Installation</div>
        <div className="ov-card-body">
          <div className="ov-steps">
            <Step n={1} title="Wire RS-485"
              text="Connect the building MS/TP trunk to the OSCVT RS-485 terminals. Polarity is labeled A (+) and B (−) on the board. If you wire them backwards, OSCVT auto-detects and inverts — no damage occurs." />
            <Step n={2} title="Power the device"
              text="Supply 7–36V DC to the power terminals (Pro: DC jack or USB-C; Mini: screw terminal). The device can also be powered from the MS/TP bus if the bus carries sufficient voltage. On the Pro, a LiPo battery provides backup power." />
            <Step n={3} title="Wait for startup"
              text="The Pro shows a startup screen. The Mini shows LED activity. Startup takes approximately 5–8 seconds. During startup the device passively listens to the bus to detect baud rate and polarity before joining the token ring." />
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Wi-Fi Connection</div>
        <div className="ov-card-body">
          <div className="ov-steps">
            <Step n={4} title="Find the OSCVT Wi-Fi network"
              text="The device broadcasts an AP named OSCVT-XXXXXX (where XXXXXX is the last 6 hex digits of the MAC address). On the Pro, the SSID and password appear on the display. On the Mini, check the label on the device." />
            <Step n={5} title="Connect your laptop or phone"
              text="Join the OSCVT Wi-Fi AP. The password is randomly generated and shown on the Pro display or device label. Your device gets an address in the 192.168.142.x range." />
            <Step n={6} title="Open the web UI"
              text="Browse to 192.168.142.1. The OSCVT web UI loads. You will see the bus status, detected protocol, baud rate, and polarity on the dashboard." code="http://192.168.142.1" />
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Using with OCT</div>
        <div className="ov-card-body">
          <div className="ov-steps">
            <Step n={7} title="Start OCT on your laptop"
              text="Launch the local OCT server (start.bat) while connected to the OSCVT Wi-Fi. OCT's server can reach the OSCVT at 192.168.142.1 over the Wi-Fi link." />
            <Step n={8} title="Connect in OCT"
              text="In OCT, the BACnet Router field is pre-filled with 192.168.142.1. Click Connect. OCT sends a WHO-IS through the OSCVT, which forwards it to the MS/TP bus. Devices respond and appear in the Live Devices tab." code="192.168.142.1 / 24   Net: 65001" />
            <Step n={9} title="Browse and commission"
              text="Select a device in Live Devices. Use the Objects tab to read and write present values. Use the Commissioning tab to load a CAF + perspective and see the full application layout with live values." />
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Reading Diagnostics</div>
        <div className="ov-card-body">
          <div className="ov-steps">
            <Step n={10} title="Check bus health from OCT"
              text="In OCT's Live Devices tab, open MS/TP Diagnostics. The Router Health card shows token loop time, framing errors, and dropped tokens pulled from the OSCVT. Per-device stats show response times and JCI proprietary MS/TP health counters." />
            <Step n={11} title="Check bus health from OSCVT web UI"
              text="On the OSCVT web UI dashboard, the bus health section shows the same counters updated every 5 seconds. The device table shows all MS/TP nodes in token-passing order with their response times." />
            <Step n={12} title="Export a field report"
              text="From the OSCVT web UI (planned), tap Export Report. A structured JSON report downloads to your phone or is saved to the SD card (Pro). The report includes protocol, baud, polarity, EOL candidates, device inventory, and timestamps." />
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">EOL Termination</div>
        <div className="ov-card-body">
          <p className="ov-note" style={{ marginBottom: 10 }}>
            The OSCVT Pro has a hardware EOL termination switch on the RS-485 circuit. Enable it
            when OSCVT is physically at the end of the MS/TP trunk run. Enabling EOL on a device
            in the middle of a trunk will cause signal reflections and framing errors.
          </p>
          <p className="ov-note">
            The OSCVT diagnostics identify EOL candidates based on token-passing response time
            outliers and repeated framing errors. These are heuristics, not hard measurements —
            use them as a starting point for physical inspection.
          </p>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Auto-Detection Details</div>
        <div className="ov-card-body">
          <table className="ov-table">
            <thead><tr><th>Feature</th><th>How it works</th><th>What you see</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Auto-baud</strong></td>
                <td>Measures inter-character timing on the 0x55 0xFF preamble before joining the token ring</td>
                <td>Detected baud rate shown on display and dashboard</td>
              </tr>
              <tr>
                <td><strong>Auto-polarity</strong></td>
                <td>Tries both A/B orientations; detects which produces valid preamble bytes using ESP32 UART invert mode</td>
                <td>"Polarity: Normal" or "Polarity: Inverted (auto-corrected)"</td>
              </tr>
              <tr>
                <td><strong>Protocol detection</strong></td>
                <td>Listens for frame signatures: BACnet 0x55/0xFF header CRC, Modbus 3.5-char silence gaps, N2 frame pattern</td>
                <td>Protocol label on dashboard (BACnet MS/TP / Modbus / N2)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Step({ n, title, text, code }: { n: number; title: string; text: string; code?: string }) {
  return (
    <div className="ov-step">
      <div className="ov-step-num">{n}</div>
      <div className="ov-step-body">
        <div className="ov-step-title">{title}</div>
        <div className="ov-step-text">{text}</div>
        {code && <div className="ov-step-code">{code}</div>}
      </div>
    </div>
  );
}
