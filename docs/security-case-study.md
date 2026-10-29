# Reproducible metadata assessment and re-test example

This exercise demonstrates how a security engineer can write a narrowly
scoped **before / after report** with traceable evidence. It is not a live
penetration test and cannot establish that a real deployment has been fixed.

## Run

With Node.js 24, from this repository:

```bash
npm ci --ignore-scripts
npm test
npm run case-study
```

The command writes two ignored files:
`artifacts/security-case-study/report.json` and `report.md`.
They contain only synthetic metadata, assessment IDs, JSON pointers,
evidence integrity hashes, before/after observations, and explicit limits.

## Example remediation cases

- Declare authentication as required, without claiming that live
  enforcement has been verified.
- Close the input JSON schema of a fictional `search` tool.
- Remove an advertised destructive tool instead of merely relabeling it.
- Re-test for the disappearance of a finding concerning that tool's
  unknown effects.

A real finding requires written owner authorization, reproducible evidence
from the authorized scope, reviewer verification, remediation confirmation,
and an independent post-fix check. The repo's Worker deliberately performs
**zero target requests**; no request can be directed at real systems.

## Evidence integrity

The local Worker produces contract v2 events; the script verifies every
event with `verifyEvidence` and includes their event IDs and hashes in
the sample report. Hashing detects changes to the returned payload, but
does **not** authenticate a server, prove exploitability, or establish
provenance. Do not cite the example as a client engagement.
