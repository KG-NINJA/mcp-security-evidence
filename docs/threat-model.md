# Threat model

## Assets and trust boundaries

Protect authorization tokens, system-owner scope, customer metadata, runtime/network isolation and evidence integrity. Request bodies, tool names, schemas, annotations, DNS and remote responses are untrusted. Operator-provisioned scope and limiter are trusted controls. No target is trusted to receive requests: the outbound assessment transport is absent.

## Threats and controls

| Threat | Current control | Limitation / next gate |
| --- | --- | --- |
| Unauthorized assessment | Token + operator subject/URL scope + explicit attestation; missing configuration denies | Operator must verify written authority and rotate/revoke tokens; no automatic proof-of-control |
| SSRF, metadata endpoints, rebinding, redirect pivots | No outbound target calls in any mode; lexical URL gate also rejects IP literals/internal forms | Live mode cannot launch without IP-pinned broker and hop-by-hop DNS/IP checks |
| Expensive payload/slow client | Streaming 64 KiB cap, depth 20, 50 tools, 2s read deadline | Platform request ingress costs remain; configure edge limits before any exposure |
| Abuse/rate bypass | Required global Durable Object limiter; persistent transactional sliding window across endpoints; errors deny | Five assessments per rolling minute across the deployment; provider ingress costs still need account limits |
| Malicious schema/descriptions | No execution, schema dereference, remote refs, tool calls or HTML rendering; observations are fixed strings | Submitted metadata may lie; unknown/custom semantics require human review |
| Data leakage | No storage, logs or raw metadata echo; no-store responses; credentials excluded | Client controls its own copies; operator must not enable body logging |
| Forged evidence | Content hash detects changes; source and limitations explicit | Hash is not a signature or proof of provenance |
| Commerce/production impact | No payment/billing/deployment code; workers_dev and preview URLs disabled | No production deployment or payment activation authorized |

## Residual risk and release gates

This MVP assesses assertions supplied by an authorized caller, not actual server behavior. It cannot certify MCP conformance, runtime authorization or absence of vulnerabilities. Production Cloudflare integration remains unverified; local runtime and synthetic tests do not certify production operations. No live targets may be used in testing. Deployments, wallet signing, financial transfers, AVU/SI modifications and Anti-ARTEX coupling remain outside scope.

Required before a live scanner release: vetted egress transport, owner authorization lifecycle, account spend controls, privacy/retention review, and synthetic tests covering all reserved networks, every redirect hop and DNS change at connection time.
