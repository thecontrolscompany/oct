# OCT Merge Tickets

This backlog turns the unattended sprint into issue-sized work items. The order below matches the recommended execution path in `SPRINT.md`.

## Ticket 001 - Canonical Reference Index

Summary:
- Build one shared reference index helper for both archive parsers and the viewer.

Acceptance criteria:
- `ReferenceHit` carries source file path and referring object path metadata.
- The shared package exports a canonical reference index with grouped hits and counts.
- The UI and backend use the same helper instead of rebuilding ad hoc maps.

Depends on:
- Phase 1 shared archive contracts

## Ticket 002 - Reverse Lookup Metadata Surfacing

Summary:
- Show the new reference metadata in the file viewer and object detail views.

Acceptance criteria:
- Incoming references display source path and referring path.
- Browse rows show dependency counts.
- Clicking a reference still navigates to the referring object.

Depends on:
- Ticket 001

## Ticket 003 - Nested Reference Scanning

Summary:
- Expand reference detection into nested XML-bearing payloads.

Acceptance criteria:
- Base64-wrapped or nested XML content is scanned for references.
- The scan preserves enough context to jump back to the source item.
- False positives are reduced by keeping token matching constrained.

Depends on:
- Ticket 001

## Ticket 004 - Cross-Archive Diff Clarity

Summary:
- Improve object-level diffing and export output.

Acceptance criteria:
- Added, removed, and changed objects are easier to distinguish.
- Property-level changes are visible for modified objects.
- CSV export stays stable and readable.

Depends on:
- Ticket 001
- Ticket 002

## Ticket 005 - Native Unbound Reference Audit

Summary:
- Let OCT find unbound references without SCT CSV input.

Acceptance criteria:
- `.dbexport` scanning alone can produce a usable unbound-reference audit.
- Findings are drillable back to the file and object path.
- Results reuse the shared reference index.

Depends on:
- Ticket 001
- Ticket 003

## Ticket 006 - Duplicate and Suppressed Audit Checks

Summary:
- Add more archive audit coverage beyond unbound references.

Acceptance criteria:
- Duplicate descriptions are detected.
- Suppressed alarms are detected.
- Each result links back to the source object.

Depends on:
- Ticket 005

## Ticket 007 - Cleanup Rewrite Planning

Summary:
- Convert audit findings into safe rewrite candidates.

Acceptance criteria:
- Repoint suggestions are confidence-scored.
- Rename-based bulk fixes are previewed before execution.
- Destructive changes require explicit confirmation.

Depends on:
- Ticket 005
- Ticket 006

## Ticket 008 - Archive Rewrite Operations

Summary:
- Add safe archive cleanup operations.

Acceptance criteria:
- Bulk apply-to-archive works for rename patterns.
- Delete-to-archive is available for supported file-level items.
- Output archives remain importable.

Depends on:
- Ticket 007

## Ticket 009 - As-Built Documentation

Summary:
- Produce consultant-ready archive documentation.

Acceptance criteria:
- The report includes topology, inventory, point lists, and audit findings.
- Dependency hotspots and enum labels are included.
- The output prints cleanly from the browser.

Depends on:
- Ticket 002
- Ticket 005

## Ticket 010 - UI Guardrails

Summary:
- Keep OCT feeling like one app while archive tooling expands.

Acceptance criteria:
- Live BACnet, MS/TP, package, and commissioning views continue to work.
- Archive tabs do not steal focus or state from live-device panes.
- Loading and error states stay polished.

Depends on:
- Tickets 002 through 009

## Ticket 011 - Fixture Corpus

Summary:
- Create representative archive fixtures for testing and regression work.

Acceptance criteria:
- `.caf`, `.dbexport`, diff, and audit fixtures exist.
- Each bug found during the sprint gets a minimal reproduction file.

Depends on:
- Ticket 001

## Ticket 012 - Parser and UI Regression Tests

Summary:
- Add tests for the shared archive flows and viewer behavior.

Acceptance criteria:
- Reference counts and reverse lookup stay covered.
- Enum rendering and exports stay covered.
- Large-archive smoke tests exist.

Depends on:
- Tickets 001 through 011

## Ticket 013 - Deployment Hardening

Summary:
- Make release behavior repeatable and observable.

Acceptance criteria:
- GitHub and Vercel links are verified.
- The production branch is documented.
- Manual redeploy remains the fallback when webhooks lag.

Depends on:
- Tickets 001 through 012

