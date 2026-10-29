# Security practitioner application casebook — offline MCP lab

**Intended audience:** entry-level / junior AI-security testing and QA positions,
security engineering apprenticeships, evidence-focused testing support.

This casebook deliberately differentiates *testing methodology* from actual
penetration-testing experience. The intentionally vulnerable function is a
standalone **synthetic, in-memory reference**, not an exploitable real MCP service.

## Reproduce

With Node 24:

```sh
npm ci --ignore-scripts
npm test
npm run case-study
npm run lab:authz
npm run lab:http
```

This generates ignored `artifacts/authorization-lab/report.{json,md}`.
A reviewer can inspect the case matrix, repeat local tests, and compare
baseline and fixed behavior. Seven in-memory scenarios include five rejected insecure operations and two valid controls. A separate eight-case local HTTP harness binds only to 127.0.0.1, verifies 401/403/404/200 responses, ignores client-supplied role hints, and checks a fictional one-time approval. Neither constitutes an external penetration test.

### Assessment method and evidence

1. **Rules of engagement:** only a fictional dataset in local memory.
2. **Asset and threat boundaries:** two tenants, two roles, read and delete,
   client-supplied tool annotations, and destructive-action confirmation.
3. **Reproduction:** invoke exactly the same request on deliberately flawed
   and restricted code with fresh copy-on-write test data.
4. **Verification:** assert the expected HTTP-equivalent status for each case.
5. **Retest:** a rejected request cannot modify another tenant's record;
   authorized read and confirmed delete remain functional.
6. **Report:** include scenario ID, failure category, outcomes, test method,
   limits, and SHA-256 of synthetic fixture definitions.

### Known gaps

No active scanners, Burp Suite, actual MCP endpoint, DNS/IP checks, real
authentication, user-generated tokens, customer systems, traffic capture,
commercial vulnerability finding, or exploitability claim exists here.

Evidence-format validation is provided separately by the current
`MCP Security Evidence` Worker and common Evidence Contract v2.
These casebook records are *not* signed Evidence Contract v2 events.

### Job application scope

Suggested description: “I built an isolated authorization test harness
that reproduces cross-tenant access control failures, overprivileged
operations, and missing confirmations against deliberately insecure mock
code, then validates deny-by-default fixes and generates a reproducible
report. This is a synthetic portfolio project, not paid pentesting history.”

For a real contract, obtain written authorization and escalation contacts,
agree scope and test windows, avoid destructive operations unless explicitly
permitted, protect sensitive output, and have results reviewed by an
experienced tester.
