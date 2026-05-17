# dbexport-viewer Parity Backlog

This backlog tracks the remaining archive-analysis features from `dbexport-viewer` that OCT still needs to mirror or absorb.

## Already Covered

- `.caf` and `.dbexport` file browsing in one viewer
- Tree navigation with object details
- Incoming reference indexing and counts
- Diff view for comparing snapshots
- CSV and JSON export
- Archive audit summaries
- Better class and property name resolution than the original viewer in several cases

## Remaining Gaps

### 1. Graphics and Binding Inspection

- Render graphics content instead of only counting graphics-like objects
- Add a dedicated browser for object-to-graphic bindings
- Show what graphics reference a given point or object
- Surface dependency hotspots directly in the UI

Acceptance criteria:
- A user can select an object and see every graphic that depends on it
- Graphics-related payloads can be inspected without leaving the viewer

### 2. Nested Payload Decoding

- Recursively scan nested XML-bearing payloads
- Decode `Base64Zip`-wrapped content inside graphics, user trees, and program blobs
- Preserve source context so a nested hit can be navigated back to its parent item

Acceptance criteria:
- Nested content is searchable and contributes to reverse references
- The scan reports the original source path for every nested hit

### 3. Bulk Repoint and Cleanup

- Add confidence-scored repoint suggestions
- Support bulk rename-based cleanup
- Apply safe archive rewrites for dead references
- Keep destructive actions behind explicit confirmation

Acceptance criteria:
- The app can generate a repair manifest from audit findings
- A user can preview and apply repoint operations in bulk

### 4. Safe Delete / Rewrite Operations

- Add controlled delete workflows for supported archive items
- Keep original archives untouched when producing a repaired output
- Return an importable archive after each rewrite pass

Acceptance criteria:
- Cleanup output can be re-imported into SCT or OCT
- Users get a clear before/after summary

### 5. Audit Coverage Expansion

- Detect duplicate descriptions
- Detect suppressed alarms
- Detect orphaned graphics
- Keep each finding drillable to the source object

Acceptance criteria:
- Audit results are actionable, not just informational
- Each finding links back to the archive context that caused it

### 6. Consultant-Ready Reporting

- Generate a printable as-built style report
- Include topology, inventory, point lists, schedules, and audit findings
- Add summary sections for dependency hotspots and unresolved items

Acceptance criteria:
- The report opens cleanly in the browser
- The output is usable as a handoff document

### 7. Parity Polishing

- Make export behavior stable across selections and file types
- Improve property-level compare detail
- Group change results by object and section more clearly
- Keep export labels consistent across tables, diff views, and reports

Acceptance criteria:
- The viewer feels consistent when moving between file types and view modes
- Exported data can be shared without manual cleanup

## Suggested Order

1. Nested payload decoding
2. Graphics and binding inspection
3. Bulk repoint and cleanup
4. Audit coverage expansion
5. Safe delete / rewrite operations
6. Consultant-ready reporting
7. Parity polishing

## Notes

- OCT already goes beyond dbexport-viewer in live BACnet, MS/TP, commissioning, and package workflows.
- The remaining work is mostly about deep archive analysis and cleanup automation.
