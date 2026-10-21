# MCP Security Evidence

Read-only, authorization-gated Cloudflare Worker MVP for reviewing **submitted MCP metadata**. Implements [Issue #1](https://github.com/KG-NINJA/mcp-security-evidence/issues/1) with an explicit live-probing limitation. No tools are invoked. No external targets are contacted. No payments, x402, billing, deployment, honeypot, AVU/SI or Anti-ARTEX runtime integration exists.

## Develop and validate

Node.js 24 and npm are required. Use the existing checkout; no worktree is needed.

```sh
npm ci --cache /workspace/.npm-cache
npm run lint
npm test
npm run sample
npx wrangler deploy --dry-run --outdir /tmp/mcp-worker-build
```

`lint` runs strict TypeScript static checks, not a separate style formatter. Tests use synthetic fixtures and in-process Worker requests, without contacting the named target. Sample outputs are in `docs/examples/`. `npm run dev` starts a local Wrangler runtime. `GET /health` verifies startup. Without operator configuration, assessment endpoints return 503 by design.

## API and authorization

- `GET /health`: mode and safety status; no secrets.
- `POST /assessments`: assessment ID, machine-readable evidence and Markdown report.
- `POST /evidence-report`: same JSON representation (stateless; no report retrieval/storage).
- `POST /report`: Markdown representation.

All POST endpoints require JSON, `Authorization: Bearer <token>`, and the request shape in `fixtures/authorized-request.json`. Generate a random token of at least 32 characters for real local use; examples are synthetic credentials only. Never submit secrets in metadata. Output contains fixed observations and JSON pointers rather than arbitrary tool descriptions or raw inputs. Responses use `Cache-Control: no-store`.

Operator-only configuration (not accepted from request headers/body):

| Binding | Purpose |
| --- | --- |
| `ASSESSMENT_TOKEN` | Secret bearer token, at least 32 characters |
| `AUTHORIZED_SUBJECT` | Subject whose authority the operator has independently verified |
| `AUTHORIZED_TARGET` | Exact normalized HTTPS URL covered by that authorization |
| `RATE_LIMITER` | GlobalRateLimiter Durable Object binding (configured in wrangler.jsonc) |

Before provisioning any scope, the operator must obtain documented written authorization naming the owner, exact target and metadata-review scope. Retain that authorization outside this service and revoke the binding when it expires. A caller's `explicit_authorization: true` alone does not grant access: server-side scope and token must already exist. This MVP does not automate ownership verification, expiry or multi-tenant authorization. Use a separate scope/token per isolated instance; do not expose a publicly shared token.

The included Durable Object enforces **at most 5 requests in a rolling 60-second window globally**, across all POST endpoints and all locations. A stable object name and transactional persistent timestamps prevent isolate resets, token rotation and endpoint switching from bypassing the quota. Storage errors fail closed. `wrangler.jsonc` registers the object and its migration for local development; no deployment is performed. Tests cover concurrent admissions, storage persistence, window expiry and clock regression. In-process Worker tests substitute the binding; local Wrangler integration is validated separately. No deployment commands are required or authorized by this project task.

## Safety and live-probing blocker

The only supported mode is `submitted-metadata`. Other modes return 422 before any network operation. Targets must be HTTPS hostnames, without credentials, query, fragment, custom port or IP literals. Internal suffixes and numeric/encoded IPv4 and IPv6 literals are denied. This URL gate is **not** a DNS or SSRF-safe transport.

Worker `fetch` does not provide a supported per-request public-IP pinning mechanism. Checking DNS and then fetching the hostname leaves a rebinding race; validating just the first response misses redirects. Therefore **all live DNS, redirects, probes and target fetches are disabled**. Even a public hostname that resolves to private/link-local/metadata addresses cannot cause a connection. Live DNS/IP validation is not implemented and is an outstanding Issue #1 deliverable. Before adding it, use a reviewed egress broker that resolves every hop, rejects all non-public/reserved IPv4/IPv6 ranges and mapped forms, pins the validated IP with hostname TLS verification, disables automatic redirects, revalidates every manually allowed hop, enforces fixed request/response/time budgets and never sends credentials cross-origin. Add synthetic rebinding/redirect transport tests before enabling it. Do not treat this MVP as a live scanner.

Each request is capped at 64 KiB, depth 20, 50 unique tools and a 2-second body-read deadline. No external requests, execution, callbacks, mutation tests or remote tool calls occur. Reports are advisory: schema permissiveness and annotations do not establish exploitable vulnerabilities.

## Evidence contract

`schema/evidence-v1.json` implements the thirteen shared fields named in Issue #1. `schema_version` is the string `"1"`; severity/confidence are strings; evidence is an object; limitations is an array. SHA-256 covers all event fields except `content_hash`, with recursively sorted object keys, preserved array order and compact JSON (`src/evidence.ts`). UUID/time vary per observation; finding rules are deterministic. Hashes detect content changes; they do not prove origin, authorization or authenticity.

Anti-ARTEX remains independent. Share only this versioned contract; no shared D1, credentials, packages or runtime services. No separate authoritative partner schema or compatibility fixtures were available in the repository/Issue. Compatibility is validated against the Issue's field contract and this local JSON Schema; cross-project enum/typing/hash agreement still requires partner review before integration. See [contract notes](docs/evidence-contract.md).

See [threat model](docs/threat-model.md) and [commercial validation and budget](docs/budget.md). No live assessment, production or commerce readiness is claimed.
