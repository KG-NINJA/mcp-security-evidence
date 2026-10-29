# Authorized MCP Security Review — engagement report template

> **Template only.** All bracketed sections require a real, separately documented engagement.
> No approval or finding is implied by the existence of this file.

## 1. Scope and rules of engagement

| Field | Required entry |
|---|---|
| Client / system owner | [Legal entity, owner contact] |
| Written authorization reference | [Signed document ID and date] |
| Authorized assets | [Exact hostnames and paths; excluded IP ranges] |
| Test window and timezone | [Start and end] |
| Allowed techniques | [Non-destructive checks explicitly approved] |
| Forbidden techniques | [Anything not approved; no persistence or credential extraction] |
| Escalation / stop contact | [Contact and response time] |
| Data handling and retention | [Approved storage, access, deletion timetable] |
| Rollback and emergency stop | [Owner-run process] |

**Stop condition:** absent authorization, scope mismatch, unexpected sensitive data, or unavailable emergency contact → do not test.

## 2. Method and environment

- Client-supplied metadata analysis: [source, exact input hash, version]
- Local synthetic reproduction: [repo commit, command, test environment]
- Live tests: **not performed** unless separately authorized, documented and logged
- Tool calls, outbound requests and credentials: [explicit accounting]
- Constraints and untested assumptions: [list]

## 3. Individual finding record

| Field | Value |
|---|---|
| Finding ID | [e.g. AUTHZ-001] |
| Title | [Short, factual] |
| Verified state | [Unconfirmed observation / Reproduced in authorized test / Not reproducible] |
| CWE / reference | [Only if mapping is verified] |
| Severity | [Method and rationale, not automatically inferred] |
| Asset and authorized scope | [Redacted identifier] |
| Preconditions | [Necessary context and permissions] |
| Minimal safe steps | [No live secrets or destructive commands] |
| Expected behavior | [Policy/requirements] |
| Actual behavior | [Sanitized observation] |
| Evidence | [Artifact SHA-256, timestamp, tested revision, redacted transcript] |
| Business impact | [Evidence-based; separate hypothesis from demonstrated] |
| Remediation | [Owner-appropriate change] |
| Retest result | [Date, revision, reproducible outcome] |
| Residual risk | [Unknowns, follow-up recommendation] |
| Reviewer | [Named tester and independent reviewer where available] |

## 4. Evidence integrity and privacy

- Verify the hash of the stored, *sanitized* evidence before review.
- A SHA-256 digest detects changes but does not prove ownership, authorization or truth.
- Never include customer credentials, raw production prompts, access tokens, personal data or full HTTP Authorization headers.
- Keep raw logs outside the public GitHub repository; publish only synthetic or expressly cleared examples.
- Preserve signed scope and owner approvals separately from public findings.

## 5. Re-test and delivery gate

- [ ] Written authorization and scope verified
- [ ] Finding reproduced by the tester within the permitted boundary
- [ ] False positives, limitations and assumptions recorded
- [ ] Remediation discussed with system owner
- [ ] Modified version and deployment identity confirmed
- [ ] Post-fix test carried out without harmful effects
- [ ] Residual risks / non-reproduced cases documented
- [ ] Owner acknowledges the final report
- [ ] Retention/deletion rules applied

## 6. Portfolio usage

The synthetic laboratories in this repository demonstrate **how to structure a test and report**, not prior commercial penetration-testing experience. Do not reuse this template to imply an external customer audit has happened.
