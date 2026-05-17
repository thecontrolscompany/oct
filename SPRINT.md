# OCT Merge Sprint

**Goal:** absorb the archive-analysis strengths from `dbexport-viewer` into OCT while preserving OCT's live BACnet, MS/TP, commissioning, and package workflows.

**Run style:** unattended, phase-by-phase, no confirmations unless a change would be destructive or structurally risky.

**Current baseline:** Phase 1 shared archive contracts and Phase 2 file viewer parity are in place and already deployed. This sprint continues from there.

---

## Operating Rules

- Prefer shared backend/data contracts over duplicating parsing in React.
- Keep the live commissioning app as the shell, not a second app embedded inside it.
- Reuse the existing `FileViewerPane`, `ObjectBrowser`, and server parsers as the foundation.
- Treat reverse-lookup, audit, and export as reusable archive services.
- Keep build green after each phase.
- If a phase can be split into independent slices, complete the critical path first and defer polish to the end of the phase.

## Success Criteria

The sprint is complete when OCT can:

- Open and browse `.caf` and `.dbexport` files in one viewer
- Show reverse references and dependency hotspots throughout the UI
- Scan `.dbexport` archives natively for unbound references
- Decode nested `Base64Zip` payloads for graphics and logic content
- Produce actionable audit findings without SCT CSV inputs
- Repoint or delete archive content with safe confirmations
- Generate consultant-ready as-built documentation
- Keep live BACnet, MS/TP, commissioning, and package workflows intact

---

## Phase 3 - Reverse Lookup and Audit Plumbing

**Purpose:** build one durable reference index that powers browsing, audit, cleanup, and export.

### Tasks

- [ ] Normalize the `ReferenceHit` contract so it can carry source path, referring item, referring attribute, and target consistently for both `.caf` and `.dbexport`
- [ ] Build a canonical reference index helper that groups hits by target
- [ ] Track source file path and object path for every hit
- [ ] Expand reverse lookup coverage to nested XML-bearing payloads, not just outer object properties
- [ ] Preserve enough metadata to jump from any hit back to its source context
- [ ] Add counts for incoming references on object detail and browse rows
- [ ] Make reverse-lookup queries fast enough to use interactively on large archives
- [ ] Keep the scan logic in the backend or shared data layer, not in UI components

### Exit Criteria

- One selected object can answer "what references this?"
- The reference index can be reused by later audit workflows without rescanning
- The UI can show dependency counts without extra ad hoc lookups

### Risks

- Reference token false positives from generic XML text
- Large archives producing expensive rescans
- Divergence between `.caf` and `.dbexport` hit shapes

### Definition of Done

- Reverse lookup is a shared primitive, not a feature-specific helper
- Object detail, browse tables, and the references view all use the same backing index

---

## Phase 4 - Diff, Compare, and Export

**Purpose:** make archive comparison and export consistent across file types.

### Tasks

- [ ] Upgrade file diff to show added, removed, and changed objects more clearly
- [ ] Add property-level change detail for modified objects
- [ ] Keep same-site and cross-site comparisons distinct
- [ ] Preserve diff export as CSV
- [ ] Make export schemas stable and predictable for external review workflows
- [ ] Unify the CSV / JSON export behavior for archive data
- [ ] Keep enum labels, class labels, and property labels consistent across exports
- [ ] Add confidence-safe sorting and filtering for large diff results

### Exit Criteria

- Two snapshots can be compared with useful output
- Exported files can be handed to another analyst without cleanup
- The same object exported from the browser and the backend produces equivalent labels

### Risks

- Diff noise from unstable ordering
- Different archive shapes creating misleading comparisons
- Export changes regressing the current live UI

### Definition of Done

- Diff and export behavior is coherent across the whole app
- The compare workflow is useful on both `.caf` and `.dbexport`

---

## Phase 5 - Native Audit Workflows

**Purpose:** remove SCT CSV dependence and let OCT do the audit work itself.

### Tasks

- [ ] Port the unbound-reference scanner so `.dbexport` alone is enough
- [ ] Decode nested payloads such as graphics, logic blobs, and Base64Zip content
- [ ] Add duplicate-description detection
- [ ] Add suppressed-alarm detection
- [ ] Add orphaned-graphics detection
- [ ] Keep each audit result drillable from summary to object
- [ ] Add traceability back to the file path and object path for every finding
- [ ] Preserve the existing `References` view as a shared source of truth

### Exit Criteria

- The app can perform meaningful archive audits without SCT CSV inputs
- Audit tabs support real cleanup decisions instead of just reporting

### Risks

- Nested content formats that vary by firmware or content type
- False positives in unbound ref detection
- Performance issues on large production archives

### Definition of Done

- Users can scan a file, review findings, and trust the output enough to act on it

---

## Phase 6 - Fix and Cleanup Workflows

**Purpose:** convert audit findings into safe repair operations.

### Tasks

- [ ] Add confidence-scored repoint suggestions
- [ ] Add bulk apply-to-archive for rename patterns
- [ ] Add delete-to-archive for file-level items
- [ ] Keep manual cleanup warnings for object-level deletions
- [ ] Add categorized confirmation dialogs before destructive actions
- [ ] Preserve a valid, importable archive as the output of every rewrite path
- [ ] Keep a follow-up summary of what was changed and what still needs manual work
- [ ] Make the workflow reversible by keeping the original input untouched

### Exit Criteria

- The user can move from scan to audit to fix in one tool
- The app emits corrected archives, not just reports

### Risks

- Destroying content that should only have been repointed
- Over-applying rename heuristics
- Breaking archive validity on output

### Definition of Done

- A cleanup pass can be completed safely and re-imported into SCT when needed

---

## Phase 7 - Documentation Output

**Purpose:** turn the archive and audit output into a handoff-ready report.

### Tasks

- [ ] Add printable as-built documentation generation
- [ ] Include topology, inventory, point lists, schedules, and audit findings
- [ ] Open the report in a browser tab and print cleanly
- [ ] Keep the output readable by consultants, owners, and commissioning staff
- [ ] Add summary sections for dependency hotspots and audit counts
- [ ] Include the same class and enum labels used elsewhere in the app

### Exit Criteria

- A user can export a consultant-ready summary from OCT

### Risks

- Report bloat on large archives
- Missing sections when an audit was not run
- Format drift between on-screen data and exported report data

### Definition of Done

- The documentation output is credible enough to replace a hand-built deliverable in routine use

---

## Phase 8 - UI Integration and Guardrails

**Purpose:** make the archive tools feel native inside OCT, not bolted on.

### Tasks

- [ ] Keep live BACnet commissioning panes working
- [ ] Keep MS/TP diagnostics and serial capture intact
- [ ] Keep package, dictionary, and live-device panels intact
- [ ] Fit archive tools into the existing navigation instead of introducing a second shell
- [ ] Maintain polished loading, empty, and error states
- [ ] Keep large archives responsive by avoiding unnecessary rerenders
- [ ] Prevent the new archive tools from stealing state or focus from live-device tabs
- [ ] Ensure file-viewer actions work with the app’s routing and tab model

### Exit Criteria

- Archive analysis is a first-class OCT feature
- Existing live tooling still works after archive changes land

### Risks

- Accidental UI regressions across unrelated tabs
- Overly heavy data structures causing slow tab switches
- Duplicate state between route-level and component-level logic

### Definition of Done

- The app feels like one coherent product rather than a migration patch

---

## Phase 9 - Fixtures, Tests, and Validation

**Purpose:** make sure the sprint can be rerun safely.

### Tasks

- [ ] Build a fixture corpus for `.caf`, `.dbexport`, diff, and audit cases
- [ ] Add parser tests for representative real-world archives
- [ ] Add smoke tests for app startup and archive loading
- [ ] Add regression cases for reverse lookup and dependency counts
- [ ] Add regression cases for enum rendering and export behavior
- [ ] Validate performance against at least one large production-sized archive
- [ ] Keep the build green after each phase
- [ ] Add a minimal reproduction archive for each bug found during the sprint

### Exit Criteria

- The sprint can be rerun safely after future changes
- Regressions are caught early

### Risks

- Fixture creep
- Overfitting to a single archive sample
- Test maintenance becoming heavier than the feature work

### Definition of Done

- The merged app has confidence coverage for its archive parsing and export paths

---

## Phase 10 - Release Hardening

**Purpose:** reduce the chance of a broken production push.

### Tasks

- [ ] Confirm GitHub and Vercel remain linked to the same project
- [ ] Verify production branch handling after each push
- [ ] Force a Vercel redeploy when webhook delivery lags
- [ ] Check the deployed alias after each release-critical change
- [ ] Record the deployment commit SHA in the sprint doc
- [ ] Keep a short rollback note for the most recent stable deployment
- [ ] Watch for build-size or dependency warnings that indicate future cleanup work

### Exit Criteria

- Production updates can be shipped without manual archaeology each time

### Risks

- Webhook failures
- Wrong branch promoted to production
- Build cache masking a deployment problem

### Definition of Done

- The release path is boring and repeatable

---

## Suggested Execution Order

1. Reverse Lookup and Audit Plumbing
2. Diff, Compare, and Export
3. Native Audit Workflows
4. Fix and Cleanup Workflows
5. Documentation Output
6. UI Integration and Guardrails
7. Fixtures, Tests, and Validation
8. Release Hardening

## Unattended Run Rules

- If a task can be completed without waiting on user input, do it.
- If a task can be made safer with a small refactor, do the refactor before building the feature on top of it.
- If a phase is blocked by a test failure, fix the failure immediately before moving on.
- If a deployment webhook misses, use the CLI deployment path instead of waiting.
- Do not pause for cosmetic cleanup unless it is tied to a correctness or maintainability risk.
- Keep a running note of what was done and what remains in the sprint doc itself.

## Current Notes

- Phase 1: shared archive contracts are live.
- Phase 2: file viewer parity is live.
- Phase 3: shared reference-index helper is live and deep payload scanning is in progress.
- Next practical slice: thread nested payload hits through audit views and expand cleanup workflows on top of the index.
