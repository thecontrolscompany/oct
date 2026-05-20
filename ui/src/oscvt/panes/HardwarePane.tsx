export default function HardwarePane() {
  return (
    <>
      <div className="ov-hw-grid">
        <div className="ov-hw-card">
          <div className="ov-hw-header">
            <div className="ov-hw-name">OSCVT Pro</div>
            <div className="ov-hw-price">~$45 board + enclosure</div>
          </div>
          <div className="ov-hw-body">
            <p className="ov-hw-use">
              Carried by the field technician during commissioning and troubleshooting. The 4.3"
              touchscreen shows real-time bus diagnostics, detected protocol, baud rate, and polarity
              without needing a laptop. SD card stores PCAP captures and structured reports. RTC
              timestamps every report. LiPo battery allows use away from panel power.
            </p>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Board</span><span className="ov-hw-spec-value">Waveshare ESP32-S3-Touch-LCD-4.3B</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">MCU</span><span className="ov-hw-spec-value">ESP32-S3-WROOM-1-N16R8V (dual-core 240 MHz)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Flash / PSRAM</span><span className="ov-hw-spec-value">16 MB flash, 8 MB PSRAM</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Display</span><span className="ov-hw-spec-value">4.3" 800×480 IPS capacitive touch (LVGL 9.x)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">RS-485</span><span className="ov-hw-spec-value">Isolated, hardware EOL termination switch</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Storage</span><span className="ov-hw-spec-value">Micro SD card (FAT32, up to 32 GB)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">RTC</span><span className="ov-hw-spec-value">PCF85063A with battery backup</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Battery</span><span className="ov-hw-spec-value">MX1.25 LiPo, 1-cell 3.7V, max 2000 mAh</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Power input</span><span className="ov-hw-spec-value">7–36V DC jack or USB-C</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">USB-C OTG</span><span className="ov-hw-spec-value">BACnet/IP trunk scan via CDC-ECM Ethernet dongle (planned)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Firmware</span><span className="ov-hw-spec-value">ESP-IDF 5.x, shared core with Mini</span></div>
          </div>
        </div>

        <div className="ov-hw-card">
          <div className="ov-hw-header">
            <div className="ov-hw-name">OSCVT Mini</div>
            <div className="ov-hw-price">~$17–20 board + DIN rail case</div>
          </div>
          <div className="ov-hw-body">
            <p className="ov-hw-use">
              Left semi-permanently installed at a controller for ongoing monitoring. No display —
              status is via status LEDs and a browser-based web UI. DIN rail mount and wide-voltage
              bus power make it a clean permanent install. Same BACnet stack and web UI as the Pro;
              the display layer is conditionally compiled out.
            </p>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Board</span><span className="ov-hw-spec-value">Waveshare ESP32-S3-RS485-CAN (SKU 32154)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">MCU</span><span className="ov-hw-spec-value">ESP32-S3 dual-core 240 MHz</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">RS-485</span><span className="ov-hw-spec-value">Isolated RS-485</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">CAN</span><span className="ov-hw-spec-value">Isolated CAN bus</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Power input</span><span className="ov-hw-spec-value">7–36V DC wide-voltage screw terminal</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Enclosure</span><span className="ov-hw-spec-value">DIN rail protective case (included)</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Status</span><span className="ov-hw-spec-value">LEDs (no display); web UI via phone/laptop browser</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">USB-C</span><span className="ov-hw-spec-value">Firmware flashing only</span></div>
            <div className="ov-hw-spec"><span className="ov-hw-spec-label">Firmware</span><span className="ov-hw-spec-value">ESP-IDF 5.x, shared core with Pro (#ifdef DISPLAY_ENABLED)</span></div>
          </div>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Shared Firmware Core</div>
        <div className="ov-card-body">
          <p className="ov-note" style={{ marginBottom: 12 }}>
            Both hardware variants run the same firmware binary with the display layer conditionally
            compiled. A single build system produces a Pro image (with LVGL display support) and a
            Mini image (display layer stripped). BACnet stack, Modbus, N2, web UI, OTA, and
            diagnostics are identical between the two.
          </p>
          <table className="ov-table">
            <thead><tr><th>Layer</th><th>Library / Approach</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>BACnet MS/TP</td><td className="mono">bacnet-stack (Steve Karg)</td><td>Planned — 1a</td></tr>
              <tr><td>BACnet/IP routing</td><td className="mono">bacnet-stack</td><td>Planned — 1a</td></tr>
              <tr><td>Auto-baud detection</td><td>Preamble timing on 0x55 0xFF</td><td>Planned — 1a</td></tr>
              <tr><td>Auto-polarity</td><td>ESP32 UART invert mode</td><td>Planned — 1a</td></tr>
              <tr><td>Web UI (SPA)</td><td>React + Vite, served from SPIFFS</td><td>Planned — 1a</td></tr>
              <tr><td>OTA update</td><td>ESP-IDF OTA partition scheme</td><td>Planned — 1a</td></tr>
              <tr><td>PCAP capture</td><td>DLT_BACNET_MS_TP (165) to SD card</td><td>Planned — 1b</td></tr>
              <tr><td>Modbus RTU</td><td>eModbus</td><td>Planned — 1c</td></tr>
              <tr><td>JCI N2 bus</td><td>Custom (requires capture session)</td><td>Planned — 1c</td></tr>
              <tr><td>LVGL display (Pro only)</td><td>LVGL 9.x</td><td>Planned — 1a (Pro)</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="ov-card">
        <div className="ov-card-header">Ordering</div>
        <div className="ov-card-body">
          <div className="ov-info">
            Hardware is available from Waveshare directly. The firmware is not yet released —
            the boards can be purchased now and flashed when firmware is available.
          </div>
          <table className="ov-table">
            <thead><tr><th>Part</th><th>Supplier</th><th>Approximate Cost</th></tr></thead>
            <tbody>
              <tr>
                <td>Waveshare ESP32-S3-Touch-LCD-4.3B (Pro board)</td>
                <td>Waveshare, Amazon</td>
                <td>~$40–50</td>
              </tr>
              <tr>
                <td>Waveshare ESP32-S3-RS485-CAN (Mini board, SKU 32154)</td>
                <td>Waveshare</td>
                <td>~$17</td>
              </tr>
              <tr>
                <td>Enclosure for Pro</td>
                <td>TBD — 3D print or off-shelf</td>
                <td>TBD</td>
              </tr>
              <tr>
                <td>DIN rail case (Mini)</td>
                <td>Included with Mini board</td>
                <td>Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
