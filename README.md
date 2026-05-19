# OCT — Open Configuration Tool

A free, open-source tool for viewing, editing, commissioning, and diagnosing Johnson Controls Metasys field controllers. Built by the building automation community as an open alternative to proprietary vendor tools.

Runs entirely on your machine. No internet required after install. No cloud account. No vendor service call.

---

## Features

| Feature | Description |
|---|---|
| **Library Browser** | Controller tree from CCT_DB — folders, typicals, packages |
| **Attribute Editor** | Read and write controller attributes with readable names from FDB |
| **File Viewer** | Open `.caf` (CCT programs) and `.dbexport` (Metasys SCT archives) — object tree, I/O table, diff, CSV/JSON export |
| **Commissioning Preview** | Offline view of a controller program using CAF + perspective — no BACnet connection needed |
| **Live Devices** | BACnet/IP device discovery via TL-CWCVT-0 or direct IP; object browser; present-value read/write |
| **Live Commissioning** | Template-driven commissioning against a live controller with real-time value display |
| **Trending** | 30-minute rolling trend charts on any BACnet object, WebSocket-backed |
| **MS/TP Diagnostics** | Node health (JCI + standard BACnet), ranged WHO-IS scan, response-time bubble map |
| **MS/TP Serial** | USB-to-MS/TP frame capture with hex dump (ASHRAE 135 Annex H parser) |
| **Package Browser** | All installed controller firmware packages — I/O specs, logic block list, comm ports |

---

## Requirements

- **Windows** (SQL Server LocalDB and JCI CCT must be installed on the same machine)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Johnson Controls CCT v18** installed (provides SQL databases and controller packages)
- **SQL Server** running locally with `CCT_DB` and `FDB_Control_10_8___Firmware_12_0` online

---

## Setup

### First time

```bat
install.bat
```

Installs npm dependencies in `server/` and `ui/`, builds the frontend.

### Configure environment

Copy `server/.env.example` to `server/.env` and fill in your SQL credentials:

```
CCT_DB_SERVER=localhost
CCT_DB_USER=your-sql-login
CCT_DB_PASSWORD=your-sql-password

PACKAGES_DIR=C:\ProgramData\Johnson Controls\MetasysIII\Field Controller Packages
PERSPECTIVES_DIR=C:\CCT\...\Perspectives
TEMPLATES_DIR=C:\CCT\...\AttributeTemplates
```

To create a SQL login (run in `sqlcmd` as Windows admin):
```sql
CREATE LOGIN [cct-webapi] WITH PASSWORD = 'YourPasswordHere';
USE CCT_DB; CREATE USER [cct-webapi] FOR LOGIN [cct-webapi];
ALTER ROLE db_datareader ADD MEMBER [cct-webapi];
USE FDB_Control_10_8___Firmware_12_0; CREATE USER [cct-webapi] FOR LOGIN [cct-webapi];
ALTER ROLE db_datareader ADD MEMBER [cct-webapi];
```

### Launch

```bat
start.bat
```

Opens `http://localhost:3001` in your browser. Close the window to stop the server.

### Background helper for `oct.trimrespond.com`

If you want the API to stay available in the background without opening a console window, run:

```bat
scripts\install-oct-helper.bat
```

This adds a per-user startup entry that launches the OCT server hidden at logon and keeps it listening on `localhost:3001`. To remove it:

```bat
scripts\uninstall-oct-helper.bat
```

### Dev mode (hot-reload server)

```bat
cd server && npx tsx src/index.ts
```

### Rebuild UI only

```bat
cd ui && npm run build
```

---

## TL-CWCVT-0 / MAP Adapter Defaults

The connection bar pre-populates with the standard TL-CWCVT-0 defaults:

| Setting | Value |
|---|---|
| IP | 192.168.142.1 |
| CIDR | /24 |
| Network Number | 65001 |
| UDP port | 47808 |

The converter automatically forwards WHO-IS to the MS/TP network (65001) when you send a directed unicast to its IP — no explicit NPDU routing needed.

---

## File Format Notes

### `.caf` (Controller Application File)
ZIP archive containing `<name>.caf.xml`. Same JCI XML namespace as `.dbexport`. Contains all objects, logic blocks, and I/O point definitions for a single controller program.

### `.dbexport` (Metasys SCT Archive)
ZIP archive containing `navtree.xml` (site/engine/trunk/equipment hierarchy) and per-engine `archive.xml` files (flat object lists). Same XML namespace and `<object>` structure as `.caf`.

---

## Acknowledgements

- [jmsboswell67-alt/dbexport-viewer](https://github.com/jmsboswell67-alt/dbexport-viewer) — Apache 2.0. Inspired the overall archive viewer approach, especially the unified file viewer, diff workflow, and class/attribute ID cross-reference.
- [bacstack](https://www.npmjs.com/package/bacstack) — BACnet/IP client for Node.js
- [serialport](https://www.npmjs.com/package/serialport) — USB serial port access
- Class ID dictionary sourced from JCI `Primitives.xml` files distributed with CCT (factual ID↔name mappings under interoperability reference)

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

Not affiliated with Johnson Controls. Metasys, CCT, SCT, NAE, NCE, SNE, FEC, TL-CWCVT-0 are trademarks of Johnson Controls, used here for descriptive interoperability reference only.
