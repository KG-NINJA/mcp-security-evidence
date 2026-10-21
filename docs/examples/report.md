# MCP Security Evidence report

Metadata-only review. No target was contacted.

## authentication_not_declared (high)

Submitted configuration declares no authentication.

Remediation: Require authenticated access and enforce per-tool authorization.

Limitations: Submitted metadata only; provenance and live server behavior are not verified. Tool annotations are untrusted hints; no tools were invoked.

## permissive_tool_schema (medium)

Tool schema does not explicitly restrict inputs to a closed object.

Remediation: Use an object schema with additionalProperties:false and validate inputs at runtime.

Limitations: Submitted metadata only; provenance and live server behavior are not verified. Tool annotations are untrusted hints; no tools were invoked.

## tool_effects_unconfirmed (info)

Tool is not explicitly annotated read-only.

Remediation: Document tool effects and require explicit authorization for state-changing operations.

Limitations: Submitted metadata only; provenance and live server behavior are not verified. Tool annotations are untrusted hints; no tools were invoked.

## destructive_tool_advertised (medium)

Tool advertises destructive behavior.

Remediation: Restrict access and require confirmation before invoking destructive tools.

Limitations: Submitted metadata only; provenance and live server behavior are not verified. Tool annotations are untrusted hints; no tools were invoked.

## assessment_scope (info)

2 tool schemas reviewed; zero target requests made.

Remediation: Validate findings with the system owner; this report is not a compliance certification.

Limitations: Submitted metadata only; provenance and live server behavior are not verified. Tool annotations are untrusted hints; no tools were invoked.
