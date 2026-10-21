# Evidence v1 compatibility

The interoperability boundary is a JSON event, independent of report envelope, storage and runtime. Required keys from Issue #1:

`schema_version,event_id,observed_at,source_type,assessment_id,finding_type,severity,evidence,confidence,limitations,remediation,content_hash`

This implementation pins `schema_version` to string `1`, uses UTC ISO timestamps, UUIDv4 event IDs, severity `info|low|medium|high|critical`, confidence `low|medium|high`, object evidence and string-array limitations. Assessment IDs group events from a single invocation. Source `submitted_mcp_metadata` expressly avoids claiming a live observation. JSON Schema and examples are versioned in this repository. New incompatible types/semantics require a new version; consumers should not infer shared operational state.

Canonical hash input includes every field except `content_hash`; object keys sort using JavaScript string order, arrays preserve order, compact JSON uses JSON.stringify primitive encoding, UTF-8, SHA-256 with `sha256:` lowercase hexadecimal prefix. Emitted evidence contains only strings, objects and string arrays, avoiding numeric canonicalization ambiguity. Verify hashes before accepting changed records; use signatures separately if authenticity is required.

The tests validate generated events and a hash mutation case. The Issue supplied field names, not a partner schema artifact. Cross-project compatibility cannot be asserted beyond those supplied names until maintainers approve these exact enum/type/canonicalization choices. Do not import Anti-ARTEX code, secrets, D1 or live honeypot data to resolve that review.
