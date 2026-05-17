# OCT — Open Configuration Tool — Project Continuity & Turnover

**Last updated:** 2026-05-17  
**Status:** Active development — Phases 1–3 complete, Phase 4 not started

---

## What This Is

A full web-based replacement for the Johnson Controls **CCT (Controller Configuration Tool) v18.0.1.7** desktop application. The goal is a locally-hosted web UI that runs without internet access and supports:

- Offline viewing of controller programs stored in the CCT SQL Server database
- Offline commissioning preview (CAF + perspective, no controller required)
- Live commissioning over BACnet/IP via TL-CWCVT-0 WiFi adapter
- MS/TP bus diagnostics (network-side via BACnet router and serial-side via USB adapter)
- Opening and browsing `.caf` (Controller Application File) exports
- Browsing installed controller firmware packages

The original CCT is a Java/Swing desktop app. This project does **not** use the JCI DLLs yet (deferred to Phase 4) — it reads the SQL database directly and implements BACnet/IP independently via the `bacstack` npm package.

### Product parity rule

The online and offline experiences should match to the greatest extent possible. Reuse the same portal panes, shared components, and resources in both modes unless a backend dependency makes that impossible. When a difference is unavoidable, keep it limited to the data source or transport layer, not the layout or workflow.

---

## Environment

| Asset | Location |
|---|---|
| **Project root** | `C:\Users\TimothyCollins\dev\cct\` |
| **JCI DLLs** | `C:\Program Files (x86)\Johnson Controls\CCT\bin\` |
| **CCT SQL database** | `CCT_DB` on local SQL Server (`MSSQLSERVER`) |
| **FDB database** | `FDB_Control_10_8___Firmware_12_0` on same SQL Server |
| **Controller packages** | `C:\ProgramData\Johnson Controls\MetasysIII\Field Controller Packages\*.zip` |
| **Commissioning templates** | `C:\CCT\...\AttributeTemplates\*.xml` |
| **Perspectives** | `C:\CCT\...\Perspectives\*.pml` |
| **CAF test file** | `C:\Users\TimothyCollins\dev\cct\CAFs\upload.caf` |

### SQL Server credentials

The Windows service account can't authenticate via Tedious (TCP driver). A dedicated SQL login was created:

```
Server:   localhost  (or CCT_DB_SERVER env var)
Database: CCT_DB  (also queries FDB_Control_10_8___Firmware_12_0)
User:     <see server/.env — CCT_DB_USER>
Password: <see server/.env — CCT_DB_PASSWORD>
```

Created via `sqlcmd` (named pipes, Windows Auth), then granted `db_datareader` on both databases.
Credentials live in `server/.env` (gitignored). See `server/.env.example` for the variable names.

### TL-CWCVT-0 defaults

```
IP:             192.168.142.1
UDP port:       47808  (BACnet/IP standard)
Network Number: 65001  (the MS/TP bus behind the converter)
CIDR:           /24
```

The converter forwards WHO-IS to MS/TP network 65001 automatically when you send a directed unicast to its IP. No explicit NPDU routing header is needed in bacstack calls.

---

## Project Structure

```
c:\Users\TimothyCollins\dev\cct\
├── install.bat              # First-time setup (npm install + UI build)
├── start.bat                # Launch server + open browser (kills port 3001 first)
├── CONTINUITY.md            # This file
├── CAFs/                    # CAF files for testing
│   └── upload.caf           # F4-CGE09090-0 AHU controller (AHU-2001, IP 10.10.20.101)
├── tools/
│   ├── InspectDlls.ps1      # One-time DLL reflection script
│   └── dll-inspection-output.txt  # Results: DLLs target .NET Framework 4.6.1
├── server/
│   ├── package.json
│   └── src/
│       ├── index.ts         # Express app, WebSocket server, BACnet poller
│       ├── db.ts            # SQL Server connection pool (mssql/tedious)
│       ├── bacnetService.ts # bacstack client singleton, WHO-IS, read/write
│       ├── mstpSerial.ts    # serialport + ASHRAE 135 Annex H frame parser
│       ├── bacnet.d.ts      # Manual type declarations for bacstack
│       └── routes/
│           ├── spaces.ts         # GET /api/spaces — CCT item tree (tblItem)
│           ├── controllers.ts    # GET /api/controllers — FEC devices from CCT_DB
│           ├── attributes.ts     # GET/PUT /api/attributes/:id — CCT_DB + FDB join
│           ├── commissioning.ts  # Templates + live commissioning + I/O scan routes
│           ├── fdb.ts            # GET /api/fdb — firmware/module definitions
│           ├── bacnet.ts         # BACnet/IP: connect, discover, read, write
│           ├── mstp.ts           # BACnet MS/TP diagnostics (JCI + standard props)
│           ├── mstpSerial.ts     # USB-to-MS/TP serial port management
│           ├── packages.ts       # GET /api/packages — parse controller package ZIPs
│           ├── caf.ts            # POST /api/caf/upload, GET /api/caf/parse — parse .caf files
│           └── perspectives.ts   # GET /api/perspectives — parse .pml perspective files
└── ui/
    ├── package.json
    └── src/
        ├── App.tsx              # Root shell: tabs, connection bar, health polling
        ├── api.ts               # All typed fetch wrappers + interfaces
        └── components/
            ├── Sidebar.tsx              # Controller library tree (left panel)
            ├── DetailPane.tsx           # Controller detail (attributes, commissioning)
            ├── AttributeTable.tsx       # Attribute editor table
            ├── PortsTable.tsx           # BACnet port objects table
            ├── LivePane.tsx             # Live BACnet device browser + object detail + trending
            ├── MstpDiagnostics.tsx      # 4-tab MS/TP diagnostics
            ├── MstpSerialPane.tsx       # USB serial MS/TP frame capture + hex dump
            ├── PackagesPane.tsx         # Controller firmware package browser
            ├── CafPane.tsx              # CAF file viewer (tree + I/O table + stats)
            └── CommissioningPreviewPane.tsx  # Offline commissioning preview (CAF + perspective)
```

---

## Architecture

```
Browser (React 19 + TypeScript + Vite 8)
        ↕  REST  (fetch)
        ↕  WebSocket (/ws)
Express 4 + Node.js (port 3001, tsx for dev)
    ├── SQL Server (mssql/tedious)  →  CCT_DB, FDB_Control_10_8___Firmware_12_0
    ├── bacstack                    →  BACnet/IP over UDP 47808
    ├── serialport                  →  USB-to-MS/TP RS-485
    ├── adm-zip + @xmldom/xmldom    →  .caf / .zip / .xml / .pml parsing
    └── multer                      →  multipart file upload (CAF viewer)
```

### WebSocket protocol (`/ws`)

| Client → Server | Description |
|---|---|
| `{ type: "subscribe", subscriptions: [{deviceId, objectType, objectInstance}] }` | Start polling BACnet objects (7s interval) |
| `{ type: "unsubscribe" }` | Stop polling |
| `{ type: "mstp-stream-start" }` | Start receiving MS/TP serial frames |
| `{ type: "mstp-stream-stop" }` | Stop streaming |

| Server → Client | Description |
|---|---|
| `{ type: "values", data: [...] }` | BACnet present values (every 7s) |
| `{ type: "mstp-frame", frame: MstpFrame }` | Serial MS/TP frame (up to 20fps) |

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server status, BACnet connection, MS/TP serial session |
| GET | `/api/controllers` | Controller list from CCT_DB.tblItem (ItemTypeId=21 packages) |
| GET | `/api/controllers/:id` | Controller detail with ports and children |
| GET | `/api/attributes/:objectId` | Attributes with CCT_DB + FDB join (readable names) |
| PUT | `/api/attributes/:objectId` | Update attribute value |
| GET | `/api/commissioning/templates` | List XML commissioning templates |
| GET | `/api/commissioning/templates/:name` | Parse a template (modules, elements, BACnet OIDs) |
| GET | `/api/commissioning/live/:deviceId/:name` | Read all template points live from a BACnet device |
| GET | `/api/commissioning/io/:deviceId` | Read all AI/BI/MSI/AO/BO/MSO objects from a device |
| GET | `/api/fdb/*` | FDB firmware/module reference data |
| GET | `/api/spaces` | CCT item hierarchy (folders and typicals) |
| GET | `/api/perspectives` | List `.pml` perspective files |
| GET | `/api/perspectives/:name` | Parse a perspective — returns panels, feature tabs, BACoid mappings |
| GET | `/api/bacnet/defaults` | TL-CWCVT-0 defaults `{ip, port, networkNumber, prefix}` |
| POST | `/api/bacnet/connect` | Connect (body fields optional, fall back to defaults) |
| DELETE | `/api/bacnet/connect` | Disconnect |
| GET | `/api/bacnet/status` | Connection status |
| POST | `/api/bacnet/discover` | Subnet WHO-IS + directed unicast to converter |
| POST | `/api/bacnet/direct` | Unicast WHO-IS to specific IP |
| GET | `/api/bacnet/devices` | Cached discovered device list |
| GET | `/api/bacnet/devices/:id/objects` | Object list from device |
| GET | `/api/bacnet/devices/:id/objects/:type/:instance` | Read key properties |
| PUT | `/api/bacnet/devices/:id/objects/:type/:instance/present-value` | Write present value |
| GET | `/api/mstp/stats/:deviceId` | JCI proprietary MS/TP node health (props 2858, 2892, 2893, 64646) |
| GET | `/api/mstp/stats-bulk` | Quick stats for all discovered devices |
| GET | `/api/mstp/standard/:deviceId` | Standard ASHRAE 135 device props (any vendor) |
| GET | `/api/mstp/network-port/:deviceId` | BACnet Network Port Objects (type 56) |
| POST | `/api/mstp/scan` | Ranged WHO-IS with response timing |
| GET | `/api/mstp-serial/ports` | List COM ports |
| GET | `/api/mstp-serial/status` | Serial session status |
| POST | `/api/mstp-serial/connect` | Open COM port `{path, baudRate, mode}` |
| DELETE | `/api/mstp-serial/connect` | Close COM port |
| GET | `/api/packages` | All installed controller packages (newest version per model) |
| GET | `/api/packages/all-versions` | Every installed version across all models |
| GET | `/api/packages/:filename` | Package detail + primitives list |
| POST | `/api/caf/upload` | Parse uploaded .caf file (multipart) |
| GET | `/api/caf/parse?path=...` | Parse .caf from local filesystem path |

---

## UI Tabs

| Tab | Component | Description |
|---|---|---|
| Library | `Sidebar` + `DetailPane` | CCT_DB controller tree; attribute table; commissioning template wizard |
| Live Devices | `LivePane` | BACnet/IP device discovery; 3-tab device detail (objects / commissioning / I/O); live trend charts; MS/TP bus diagnostics |
| Preview | `CommissioningPreviewPane` | Offline commissioning preview — load a CAF + select a perspective, see application layout without a BACnet connection |
| MS/TP Serial | `MstpSerialPane` | USB-to-MS/TP frame capture; color-coded log; hex dump |
| Packages | `PackagesPane` | Controller firmware package browser; I/O specs; logic block list |
| CAF Viewer | `CafPane` | Drag-drop .caf viewer; object tree; I/O table; stats |

Connection bar (top): IP / CIDR / Network Number fields pre-populated with TL-CWCVT-0 defaults. Switches to Live Devices tab on successful connect.

---

## LivePane Detail — What Was Added

`LivePane.tsx` grew significantly and now contains multiple sub-components:

### DeviceDetail tabs

**Objects tab** — object list with type filter; click any object to open `ObjectDetail` (present value, description, units, write field).

**Commissioning tab** (`LiveCommissioningTab`) — combines a live BACnet device with a CAF file and a perspective:
- Loads the CAF via `/api/caf/parse?path=...`
- Loads the perspective via `/api/perspectives/:name`
- Calls `buildApplicationLayout()` to cross-reference CAF objects against perspective panel definitions
- Renders a 3-column layout: inputs column / logic grid / outputs column
- `ApplicationParameters` sub-component shows writable parameters for a selected application object
- `CommissioningPointRow` supports inline write with live value display
- Trend sparkline on any point via `TrendPanel`/`TrendTile`

**I/O tab** (`InputsOutputsTab`) — calls `/api/commissioning/io/:deviceId`, renders AI/BI/MSI inputs and AO/BO/MSO outputs in separate sections with live present values. Trend button on each point.

### Trend system (`useTrendManager`)

WebSocket-backed rolling trend store:
- Subscribes to the `/ws` WebSocket on mount, sends `subscribe` messages for each tracked point
- Accumulates up to 360 samples per series, max 30-minute history (`MAX_TREND_AGE_MS`)
- `TrendPanel` renders an SVG sparkline (400×80 viewBox) with min/max labels and age annotation
- `TrendTile` is a compact version for the commissioning layout
- Points can be added/removed at any time; `clearHistory()` wipes samples without unsubscribing

### Application layout builder

`buildApplicationLayout(caf, perspective)`:
- Iterates perspective `applicationPanels` (from `.pml` parsing)
- For each panel, calls `resolvePanelObjects()` which matches CAF objects by BACoid, ref path, or name heuristics
- Returns `{ panels, objectMap, childrenMap }` used by the rendering layer

`groupApplicationPanels(panels)` splits panels into `inputs` / `logic` / `outputs` regions based on panel name and object characteristics.

---

## CommissioningPreviewPane

Offline-only version of the commissioning tab — no BACnet connection required.

- Path text box (default: `C:\Users\TimothyCollins\dev\cct\CAFs\upload.caf`)
- Perspective dropdown (populated from `/api/perspectives`)
- Renders the same 3-column application layout as the Live commissioning tab
- Useful for reviewing programs before going to site

---

## Perspectives (`.pml` files)

Parsed by `server/src/routes/perspectives.ts` from `C:\CCT\...\Perspectives\*.pml`.

PML is XML. Key parsed elements:
- `<widget widgetType="...">` — UI panel definitions
- `<dataCriteria dataCriteriaType="..." />` inside each widget — how the panel maps to BACnet objects
- `<column>` — the object property/column that drives the panel (e.g., `"CLG-O"`, `"UI IN1"`)
- Feature tabs (parameters, setpoints, etc.) parsed from tab-type widgets

Returned as `PerspectiveDetail`:
```typescript
{
  name: string;
  applicationPanels: PerspectivePanel[];   // { name, widgetType, criteriaType, column, bacoidIds }
  featureTabs: Array<{ name: string; widgetType: string }>;
}
```

---

## Key Technical Details

### CAF file format (`.caf`)

- ZIP archive containing one XML file (`<name>.caf.xml`)
- Root element: `<objects xmlns="http://johnsoncontrols.com/MetasysIII/2002/3/Core">`
- Each `<object ref="..." classid="..." classVersion="..." objectid="...">`
- Ref path hierarchy: `8-1` → root device, `8-1/307_2` → first-level child, `8-1/307_2.598_10001.0_1017` → deeper children (`.` separator after first `/`)
- Key property IDs: `28`=description, `31`=short tag, `70`=model name, `75`=BACoid, `117`=units (enum set 507), `2390`=tag, `3113`=default value, `1135`=IP address (4 × unsignedByte), `3138`=wiring matrix, `3184`=connection array, `3365`=port connection
- Files may have a UTF-8 BOM — strip it before passing to xmldom
- Units resolved by querying `FDB_Control_10_8___Firmware_12_0.dbo.tblEnumMember WHERE EnumSetId = 507`; falls back to a built-in map on DB error

### Controller package format (`.zip`)

Files in `C:\ProgramData\Johnson Controls\MetasysIII\Field Controller Packages\`:
- `<model>-<version>-<buildId>.zip`
- Contains: `*.boot.bin`, `*.main.bin` (firmware), `*-0.xml` (hardware definition), `Primitives.xml` (supported logic blocks), `meta.xml` (name/version/hash), `licenses.xml`
- Hardware XML has UTF-8 BOM — strip before parsing
- Packages are SHA-256 signed; cannot create custom packages without JCI toolchain
- 63 installed models (newest version per model cached in memory on first `GET /api/packages`)

### BACnet classid → class name mapping

Defined as a static `CLASS_NAMES` record in `server/src/routes/caf.ts`. 80+ entries sourced from `Primitives.xml` in the M4-CGE09090-11.0.4.9 package.

### JCI proprietary BACnet properties

| Property ID | Name |
|---|---|
| 2390 | Short tag / object name |
| 2858 | JCI MAC Address |
| 2892 | Lost Token count |
| 2893 | Token Loop Time |
| 64646 | Active Node Table |
| 32527 | Full ref path string |
| 1135 | IP address (4-byte array) |
| 3113 | Default / present value (float) |
| 3138 | Wiring matrix (primitive-to-primitive connections) |
| 3184 | Connection array (port → signal mappings) |
| 3365 | Port connection enum |

### SQL Server schema (CCT_DB)

- `tblItem` — controller library tree (`ItemId`, `Name`, `ItemTypeId`, `ParentItemId`)
  - `ItemTypeId`: 9=Folder, 15=Typical, 21=Package(controller)
- `tblValue1` — attribute values (`ValueId`, `DescribedObjectId`, `AttributeId`, `ValueString`, `swDataTypeId`, `ArrayIndex`, `LevelIndex`)
- Joins `FDB_Control_10_8___Firmware_12_0.dbo.tblAttribute` for human-readable `AttributeName` and `MetasysAttributeNumber`
- `FDB_Control_10_8___Firmware_12_0.dbo.tblEnumMember` — enum set lookups; EnumSetId=507 gives BACnet units

### DLL inspection results

From `tools/dll-inspection-output.txt`:
- `Metasys.DataAccess.dll` — .NET Framework 4.6.1, 79 public types, entry class `JohnsonControls.Metasys.DataAccess.LocalRequests.MceRequest`
- `Metasys.FCAccess.dll` — .NET Framework 4.6.1
- Cannot load via Node.js directly; would require a .NET Framework 4.8 host process bridged via named pipes or gRPC

---

## Session Log — 2026-05-17: Graphics Viewer, UI Unification, Archive Tree

### Goal
Close the dbexport-viewer parity gap: graphics browsing, binding inspection, and a consistent online/offline UI experience.

### Commits this session
```
afb1d70  Organize graphics in tree with readable names and inline SVG viewer
1cd2f09  Fix graphics rendering for exports without archive.xml
99346b8  Restore TreeGlyph icons and workspace tabs in dbexport tree view
735f182  Fix Vercel build: remove unused navNodeHasMatch and navNodeMatches
a316d08  Restore full dbexport drill-down using ref-based hierarchy tree
9331bf7  Fix white page: move treeStats/toggleTreeNode hooks before early returns
531d049  Unify online/offline UI and persist offline graphics resolver
7d7634c  Add graphics viewer and tighten CAF workspace
6e58d76  Load graphic bindings in offline archive parser
35a6df7  Parse dbexport graphic bindings
```

### What was built

#### Graphics viewer (`GraphicsBrowser.tsx`)
- Left panel: list of class-844 / class-717 graphic objects with TreeGlyph icons and binding counts
- Right panel (`GraphicViewer`): loads SVG via `graphicResolver`, renders inline with zoom/pan (wheel + drag), collapsible "Bound Points" panel showing binding targets
- Binding overlays: injects `<style>` into the SVG DOM after render, applies `oct-bound` class (orange `drop-shadow`) to each bound SVG element by ID
- Exports `GRAPHIC_CLASS_IDS`, `buildGraphicTagMap` used by `FileViewerPane`

#### Graphic bindings in the reference graph
- **Server** (`server/src/routes/dbexport.ts`): `parseGraphicBindings()` reads `-bindings.json` files for class-357 objects; parses the compound key format `{svgElementId}${layerIndex}${bindingType}${equipmentContext}` → emits `ReferenceHit`s into the reference graph
- **Client** (`archiveParser.ts`): mirrors the server — after each engine's `archive.xml` is parsed, loops class-357 objects, loads their `-bindings.json`, emits hits into `references[]`
- Equipment context resolution: `equipment.{engineName}.{dotPath}` → `{serverPrefix}:{engineName}/{path}.{tag}`
- Property 902 ("File Name") extracted in the XML parser's switch on `pid` for both class-357 (bindings JSON) and class-844 (SVG JSON)

#### Graphics-only export fallback (added 2026-05-17)
- Some exports (e.g. "Export — Facility Graphics folder only") have **no `archive.xml`** — just hash-named `.json` SVG files and their `-bindings.json` counterparts
- When `objects.some(o => classid ∈ {357,717,844})` is false after the main parse loop, `archiveParser.ts` enumerates entries matching `/\d{8}-\d{6}-[\w]+\.json$/` and synthesizes class-844 `DbexportObject` entries with `bindingFileName` set
- Bindings from corresponding `-bindings.json` files are also parsed and added to `references[]`
- Synthetic objects get `tag: ''`, `description: <hash>` (no readable name is available without archive XML)

#### Class 717 "Graphics" vs class 844 "Facility Graphics"
- Class 717 objects (old "Graphics" folder in Metasys) store a `.xaml` filename in property 902 — these are legacy Silverlight/XAML graphics and **cannot render in a browser**
- Class 844 objects ("Facility Graphics") store a hash-named `.json` filename — these ARE SVG content despite the extension and render fine
- `GraphicViewer` now shows a clear "Legacy Silverlight graphic — cannot render in browser" message for `.xaml` filenames instead of the generic "file not found" error

#### GraphicResolver + IndexedDB persistence
```typescript
export interface GraphicResolver {
  resolve(svgFilename: string): Promise<string | null>;
}
export async function createResolverFromBytes(bytes: ArrayBuffer): Promise<GraphicResolver>;
```
- In offline mode: resolver is a JSZip closure over the live archive in memory — not serializable
- `archiveStore.ts` gained a second IndexedDB object store (`archiveBytes`, DB version 2) to persist the raw `ArrayBuffer` alongside the parsed archive
- In online mode: resolver calls `api.dbexport.graphic(filename)` → server's `GET /dbexport/graphic?filename=...`; server caches the last uploaded archive buffer in `lastArchiveBuffer`
- The file viewer no longer restores the last opened archive on refresh; it now starts empty and waits for the user to load a file again

#### Online/offline UI unification (`App.tsx`, `FileViewerPane.tsx`)
- Removed the separate `OfflineArchivePane` early-return path from `App.tsx`
- Both modes now use the same tabbed shell; offline mode hides the Library sidebar and BACnet connection bar; switching to offline auto-navigates to the File Viewer tab
- Initial view: `HAS_API_HOST ? 'library' : 'caf'`
- `FileViewerPane` accepts `mode: 'online' | 'offline'` prop and picks the correct store key and loading strategy

#### Ref-based dbexport navigation tree
- Replaced the shallow navtree.xml (`NavTreeNode`) approach with `buildDbexportHierarchy` which parses object refs (`ADS-1:NAE-1/FC-1.AHU-1.zone_temp`) to build a full deep tree: ADS → NAE → field bus / category → equipment → points
- `categorizeDbexportSegment` recognises FC-N, FCB, N2 Trunk, BACnet Trunk, Programming, Schedule, Graphics, $site, $Generic segments
- `DbexportTreeRow` renders with `TreeGlyph` icons (engine / bus / folder / equipment / point) matching the original `OfflineArchivePane` visual style

#### Workspace tabs on device nodes (`DbexportDetailPane`)
- Right panel for dbexport Tree tab now uses `WorkspaceTabs` / `WorkspaceSection` / `WorkspacePropertiesCard` from `ObjectWorkspace`
- Device nodes (non-folder, non-engine objects) show: Configuration · Diagnostics · Communication · Email · SNMP · Syslog · Alarm · Trend · Security · Audit · Network · Device · All Properties tabs
- Group nodes (folders, engines, categories) show: Overview · Contents · All Properties tabs
- "Bound to Graphics" section surfaces graphic hit references inside the detail pane
- CAF files still use the simple `ObjectDetail` panel (no workspace tabs — CAF objects don't have the same property density)

### Bugs fixed this session

| Commit | Bug | Root cause |
|--------|-----|------------|
| `9331bf7` | White page on startup (offline mode) | `treeStats` useMemo and `toggleTreeNode` useCallback were called **after** four `if (restoring) return` / `if (!currentFile) return` early-return statements — React hooks rule violation; inconsistent hook count between first render (`restoring=true`, hooks not reached) and subsequent renders |
| `735f182` | Vercel build failure | `navNodeHasMatch` and `navNodeMatches` became unused after replacing `NavTreeNode` with `DbexportTreeRow`; `noUnusedLocals: true` in tsconfig causes `tsc -b` to error |
| `a316d08` | Navigation drill-down lost below NAE level | `FileViewerPane` used navtree.xml which only has top-level engine nodes; OfflineArchivePane had `buildDbexportHierarchy` (ref-based) which was not ported during unification |
| `99346b8` | TreeGlyph icons and workspace tabs gone | Same cause — `OfflineArchivePane` had `TreeRow`+`TreeGlyph` and full `DetailPane`; `FileViewerPane` used simpler `NavTreeNode`+`ObjectDetail` |

### Key files changed this session

| File | What changed |
|------|-------------|
| `ui/src/App.tsx` | Removed `OfflineArchivePane` early-return; unified tab shell for both modes |
| `ui/src/archiveParser.ts` | Added `GraphicResolver` interface, `createResolverFromBytes`, property 902 extraction, binding JSON parsing, graphics-only export fallback |
| `ui/src/archiveStore.ts` | Added `archiveBytes` IndexedDB store (DB v2), `saveStoredArchiveBytes`, `loadStoredArchiveBytes` |
| `ui/src/components/FileViewerPane.tsx` | Major rewrite: `DbexportTreeRow`+glyphs, `DbexportDetailPane`+workspace tabs, `buildDbexportHierarchy`, hooks order fix, `selectedDbexportNode`, `dbexportObjectMap`, `outgoing` refs, graphic-inline viewer wiring |
| `ui/src/components/GraphicsBrowser.tsx` | New component: graphic list + inline SVG viewer (zoom/pan/binding overlays); `.xaml` legacy message; `GraphicViewer` exported for reuse |
| `server/src/routes/dbexport.ts` | Added `lastArchiveBuffer` cache, `GET /graphic` route, property 902 extraction, `parseGraphicBindings` |

### Archive format discoveries

#### Three graphic class types in Metasys dbexport
| Class | ID | Folder in ref | File format | Renderable |
|-------|----|--------------|-------------|-----------|
| Facility Graphic | 844 | `$FacilityGraphics` | Hash-named `.json` that is SVG content | ✅ Yes |
| Graphic | 717 | `Graphics` | `.xaml` Silverlight file | ❌ No |
| Legacy Graphic | 344 | `Graphics` | `<Base64Zip>` wrapper around `GMFDocument` XML with gzipped SVG background + overlay stencils | ⚠️ Partial |
| Graphic Binding | 357 | (child of 844) | Hash-named `-bindings.json` | — |

#### Binding key format (`-bindings.json`)
```
"{svgElementId}${layerIndex}${bindingType}${equipmentContext}": "{pointTag}"
```
Equipment context resolution: `equipment.{engineName}.{dotPath}` → `{serverPrefix}:{engineName}/{path}.{tag}`

#### Graphics-only export structure (no archive.xml)
```
archiveobject.xml          — site-level object (classid 2000), no graphic objects
navtree.xml                — shallow site nav only
ADS-1ADS-1/
  <hash>.json              — SVG content
  <hash>-bindings.json     — binding data
  <hash>-metadata.json     — {"MasterLayer_ViewerVisibility":"true"}
```

#### Full dbexport structure (with archive.xml)
```
archiveobject.xml          — site object
navtree.xml
ADS-1ADS-1/
  archive.xml              — ALL graphic objects (classid 844/717/357) with property 902
  archive0001.xml–archive0048.xml  — point/equipment objects (no graphic class objects)
  <hash>.json              — SVG content
  <hash>-bindings.json
ADS-1NAE-10/
  archive.xml              — field controller objects
  ...
```

#### Class-844 object structure (from archive.xml)
Property 902 stores the SVG filename inside a `<struct><structElement><string>` nesting:
```xml
<object classid="844" ref="ADS-1:ADS-1/$FacilityGraphics.00001.20191212-191901-5wkojwyy">
  <property id="902"><data><struct><structElement>
    <string>20191212-191901-5wkojwyy.json</string>
  </structElement>...</struct></data></property>
  <property id="2390"><data><string>Deland B1 Exh Fans</string></data></property>
</object>
```
- Property 2390 (tag) is the **human-readable name** — always populated on class-844 objects
- Property 902 first `<string>` is the SVG filename (just the basename, no path)
- The SVG file lives in `<engine-folder>/<hash>.json` in the ZIP

#### Ref path anatomy for graphics
```
ADS-1:ADS-1/$FacilityGraphics.00001.20191212-191901-5wkojwyy
│      │     │                 │     └── hash (maps to SVG filename)
│      │     │                 └── index (00001 — groups multiple graphics, not meaningful to users)
│      │     └── $FacilityGraphics (Facility Graphics folder)
│      └── engine name (ADS-1)
└── server name (ADS-1)
```
The `00001` intermediate segment groups all graphics under one engine. It is not user-meaningful and is hidden by the label-rename logic (if the segment node has no object, it keeps its numeric label as a folder).

### Graphics in the Tree tab (added afb1d70)

- `categorizeDbexportSegment` now maps `$FacilityGraphics` → **"Facility Graphics"** and `Graphics` → **"Graphics"**
- `computeCounts` label-rename extended to cover timestamp-hash filenames (`\d{8}-\d{6}-[\w]+`): the node label is replaced with `obj.tag || obj.description`, so the tree shows **"Deland B1 Exh Fans"** instead of the raw hash
- When a class-844, class-717, or class-344 node is selected in the Tree tab, `DbexportDetailPane` bypasses workspace tabs and renders **`GraphicViewer` inline** (same zoom/pan/binding-overlay viewer as the Graphics tab)
- `GraphicViewer` is now exported from `GraphicsBrowser.tsx` for reuse
- `outgoing` references (refs FROM the selected object) are computed in `FileViewerPane` and passed to `DbexportDetailPane` so binding data appears in the viewer panel
- `dbexportObjectMap` (Map<ref, AnyObject>) built in `FileViewerPane` and passed through so `GraphicViewer` can resolve binding targets
- The previous IndexedDB-backed last-open-file restore path was removed from `FileViewerPane`; the viewer now opens without a persisted archive session
- Legacy graphics parity is still incomplete: SCT screenshots show additional white value blocks and exact overlay placement that OCT has not fully reproduced yet, so the remaining work is centered on the legacy `JCValueDisplayNodeUI` rendering path and coordinate/layout matching

### Current state of the graphics feature

| Scenario | Works? | Notes |
|----------|--------|-------|
| Full dbexport (DaytonaStateCollege) — Facility Graphics tab | ✅ | Shows all class-844 graphics with readable names |
| Full dbexport — Tree tab, click graphic | ✅ | SVG viewer opens inline |
| Full dbexport — Tree tab, filter/search | ✅ | Searches tag names |
| Graphics-only export (no archive.xml) — Facility Graphics tab | ✅ | Synthesized from hash files; names are hash strings (no tag available) |
| Full dbexport — Silverlight "Graphics" folder (class 717, .xaml) | ⚠️ | Shows "Legacy Silverlight" message; cannot render |
| Full dbexport — Legacy "Graphics" folder (class 344, Base64Zip-wrapped GMFDocument XML) | 🟡 | Base64Zip wrapper decoded first, then background SVGZ is unpacked and overlay stencils are mapped for offline rendering; export button now emits a combined SVG. Still missing some visible `JCValueDisplayNodeUI` value blocks compared to SCT, so the renderer is only partially matching the source-of-truth legacy layout |
| Page refresh — offline, graphics still visible | ❌ | The file viewer no longer restores the last opened archive on refresh; users must re-upload the archive to render graphics again |
| Online mode — graphic rendering | ✅ | `api.dbexport.graphic(filename)` → server reads from `lastArchiveBuffer` |
| Online mode — graphic rendering after server restart | ❌ | `lastArchiveBuffer` lost; user must re-upload |

---

## Phase Status

### ✅ Phase 1 — Foundation (Offline Viewing)
- SQL Server connection via `mssql` (tedious driver, SQL login)
- Controller library tree from `CCT_DB.tblItem`
- Attribute table with CCT_DB + FDB join for readable names
- React + Vite frontend, React Query for data fetching

### ✅ Phase 2 — Core Views
- Commissioning templates parsed from XML (`AttributeTemplates/*.xml`)
- FDB reference data routes
- Attribute editor (PUT /api/attributes)
- Commissioning template wizard UI

### ✅ Phase 3 — Live BACnet + Commissioning
- BACnet/IP via `bacstack` npm package
- TL-CWCVT-0 defaults pre-populated; subnet broadcast + directed unicast WHO-IS
- Device discovery, object list, property read/write (present value)
- WebSocket value polling at 7-second interval (matches CCT pattern)
- Rolling 30-minute trend history with SVG sparkline charts
- MS/TP network diagnostics (JCI proprietary + standard BACnet)
- USB serial MS/TP frame capture with ASHRAE 135 Annex H frame parser
- Controller firmware package browser (I/O specs, supported primitives)
- CAF file viewer (object tree, I/O table, stats; units from FDB)
- Perspective (`.pml`) parser
- Live commissioning tab: CAF + perspective → 3-column application layout with live BACnet reads/writes
- Offline commissioning preview tab: same layout, no BACnet connection required
- Device I/O tab: all AI/BI/MSI/AO/BO/MSO with live present values

### ❌ Phase 4 — Full JCI DLL Integration (not started)
- `MceRequest` wrapper for live BACnet via JCI DLLs
- `TransferData` — upload/download programs to controllers
- `GetInstalledPackages`, `Upgrade` — firmware management
- `StartSimulation` / `StopSimulation`
- `CreateCIFFromSystem` / `CreateSystemFromCIF` — export/import
- Job management (`GetJobInformation`, `WriteJobInformation`)
- Requires: .NET Framework 4.8 host process + IPC bridge to Node.js server

---

## Feature Gap vs CCT (No DLLs Required)

These features exist in CCT and are achievable with direct BACnet — no DLL work needed.

### High priority
| Feature | Notes |
|---|---|
| **Logic / block diagram** | Render wiring from CAF props `3138` (wire matrix) and `3184`/`3365` (port connections) as an SVG/canvas graph |
| **Command priority array** | Read BACnet `PRIORITY_ARRAY` (prop 87) on commandable AO/BO/AV/BV objects; show all 16 slots |
| **Full property editor** | Write to any writable BACnet property — currently only present-value write is exposed |
| **Device addressing** | Write to Network Port Object (type 56) to set MS/TP MAC, network number, IP config |

### Medium priority
| Feature | Notes |
|---|---|
| **Controller trend log** | BACnet `ReadRange` on Trend Log objects (type 20, class 155) for controller-stored history |
| **Schedule / calendar editor** | Read/write BACnet Schedule objects (type 17, class 263); weekly + exception schedules |
| **Alarm / event log** | BACnet `ReadRange` on Event Log objects (type 25, class 218) |
| **SA bus device management** | Live read of SA bus sub-devices via the FC bus; ZFR radio devices |

### Lower priority
| Feature | Notes |
|---|---|
| **Multi-controller bulk operations** | Multi-select devices, apply attribute changes to all |
| **Database ↔ controller compare** | Diff live BACnet values against `tblValue1` stored values |

## SCT / DaytonaState Findings

The imported SCT archive on this machine is the best new source for the remaining archive-name gaps.

### What was found
- SCTPro web UI is installed locally at `https://localhost/SCTPro`
- The installed web app exposes authenticated API routes such as:
  - `api/Authentication/LogIn`
  - `api/Authentication/AcceptTerms`
  - `api/Authentication/ChangePassword`
  - `api/Authentication/LogOut`
  - `Login/GetTermsAndConditions`
- The archive import created a populated `DaytonaState` database with archive-native metadata, not just a shell.
- Useful tables include:
  - `Item`
  - `Value`
  - `Property`
  - `ViewProperty`
  - `Attribute`
  - `ItemDefinition`
  - `ItemDef_Attrib`
- `DaytonaState` also exposes a large proc surface:
  - `spu_*` query procs
  - `spws_*` web-service procs
  - `fnu_*` utility functions

### What it resolved
- The archive DB resolves the property IDs that were still showing as `Unknown Property` or `Property N` in the offline viewer.
- Examples from the imported archive:
  - `755` -> `IEIEJ Function A List`
  - `902` -> `File Name`
  - `32532` -> `Completion Domains`
  - `32537` -> `SMTP Server Host`
  - `32542` -> `Failed Delivery Email Address`
  - `64010` -> `Process Id List`
  - `64745` -> `Syslog Reporting Enabled`

### Current naming pipeline
- BACnet standard names still resolve first for canonical IDs.
- FDB-derived names remain the next layer for standard controller definitions.
- Archive-native names from `DaytonaState` now sit alongside those maps for vendor-specific archive properties.
- Unknown values now fall back to a numeric label like `Property 755` instead of a blank generic string.

### Next useful directions
- Add a server-facing archive inspector for `DaytonaState` proc/table metadata.
- Expose a one-click refresh for the generated archive name maps.
- Keep the SCT findings in the repo notes so the archive lookup path stays reproducible.

### Implemented follow-through
- Added `GET /api/sct-archive/summary` and `POST /api/sct-archive/refresh-name-maps` on the server.
- Centralized the SCT archive SQL helpers in `server/src/sctArchive.ts`.
- Wired the offline archive browser to show the imported SCT database summary and a refresh button for the generated name maps.
- Verified the archive summary against the imported database:
  - `Item`: `90,480`
  - `Value`: `1,053,141`
  - `Property`: `216,729`
  - `ViewProperty`: `199,794`
  - `ItemDefinition`: `4,197`
  - `ItemDef_Attrib`: `113,918`
  - proc/function groups: `spu` `212`, `spws` `40`, `fnu` `42`
- Re-verified the attribute-map refresh script still writes the generated JSON files under `shared/`.

## Feature Gap vs CCT (Requires DLLs — Phase 4)

| Feature | DLL function |
|---|---|
| **Program transfer** (upload/download to controller) | `TransferData` |
| **Firmware upgrade** | `Upgrade`, `GetInstalledPackages` |
| **Simulation mode** | `StartSimulation`, `StopSimulation`, `GetSimulationValues` |
| **CIF export / import** | `CreateCIFFromSystem`, `CreateSystemFromCIF` |
| **Program editor** (add/wire primitives) | Compiler embedded in DLLs |
| **Program backup from controller** | `TransferData` (reverse direction) |
| **Bluetooth / ZigBee commissioning** | Separate JCI Bluetooth/ZigBee stack in DLLs |
| **N2 bus support** | N2 protocol handler in DLLs |

---

## Running the Project

### First time
```bat
install.bat
```
Installs npm deps in `server/` and `ui/`, builds the frontend.

### Normal launch
```bat
start.bat
```
Kills any existing process on port 3001, starts the server, opens `http://localhost:3001` after 4 seconds.

### Dev (hot-reload server, pre-built UI)
```bat
cd server && npx tsx src/index.ts
```

### Rebuild UI only
```bat
cd ui && npm run build
```

---

## Known Issues / Gotchas

1. **`tsc -b` vs `tsc --noEmit`** — The UI uses `noUnusedLocals: true` in `tsconfig.app.json`. Build uses `tsc -b` (composite mode); plain `tsc --noEmit` skips the strict check. Always use `npm run build` to catch type errors.

2. **`verbatimModuleSyntax: true`** — All interface/type imports in UI files must use `import type { X }`. Regular `import { X }` will fail if X is only a type.

3. **BOM in JCI XML** — Many JCI XML files (hardware definitions in packages, some CAFs) have a UTF-8 BOM (`﻿`). `@xmldom/xmldom` chokes on it. Always `stripBom()` before parsing.

4. **Parallel `removeListener` calls** — `bacstack` `Client` type doesn't declare `removeListener`; suppress with `client?.removeListener?.()` (optional chain).

5. **SQL Windows Auth** — The `mssql` tedious driver cannot use Windows Auth over TCP. Must use the `cct-webapi` SQL login. Do not change to Windows Auth without switching to named pipes.

6. **Port 3001 in use** — `start.bat` kills existing processes. If running from terminal, kill manually or use a different port via `PORT=3002 npx tsx src/index.ts`.

7. **CAF upload size limit** — Multer is configured at 50 MB. The test file is ~1.5 MB uncompressed; larger programs with many objects could exceed this if multiple programs are bundled.

8. **Package cache** — `loadAllPackages()` in `packages.ts` caches in memory after first call. Restart server if new packages are installed.

9. **CAF unit lookup** — `caf.ts` queries FDB `tblEnumMember` (EnumSetId=507) for BACnet unit names on first parse, then caches. If the DB is unavailable at startup, it falls back to a small built-in map. Restart server after DB comes online to get full unit names.

10. **Perspective panel matching** — `buildApplicationLayout()` matches CAF objects to perspective panels by BACoid, ref path, and name heuristics. For unusual controller types the match may be incomplete; the layout will render whatever it can resolve.

---

## Files to Read Before Continuing

If picking up Phase 4 (DLL integration):

1. `tools/dll-inspection-output.txt` — full public API surface of `Metasys.DataAccess.dll`, `Metasys.FCAccess.dll`, `JCIExtMetasysAPIHL.dll`
2. `C:\Program Files (x86)\Johnson Controls\CCT\bin\Function.xml` — complete operation contract for the JCI API
3. `server/src/bacnetService.ts` — current BACnet service (some operations will be replaced by DLL calls in Phase 4)
4. `server/src/db.ts` — SQL connection pool (reused as-is)

For understanding the CCT data model:

5. `C:\CCT\...\AttributeTemplates\Single Duct VAV Commissioning Template.xml` — commissioning schema
6. `C:\CCT\...\Perspectives\VAVSD-Damper Control.pml` — perspective UI data model
7. Any `.caf` file — controller program export (ZIP → XML, format documented above)

If continuing No-DLL gap items (logic diagram is the highest value):

8. `server/src/routes/caf.ts` — already parses prop `3184` connection arrays; extend to also extract `3138` wire matrix
9. `ui/src/components/CafPane.tsx` — add a "Diagram" tab alongside the existing Tree/I/O/Stats tabs
