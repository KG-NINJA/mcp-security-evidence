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

New output uses [common evidence contract 2.0.0](contracts/README.md) and [JSON Schema](contracts/evidence-v2.schema.json), including the JSON report wrapper's `schema_version`. Service 0.2.0 is a breaking API change: event IDs are now deterministic 64-character content digests, and qualitative confidence retains its original value inside `{scale: "ordinal", value: "medium"}`. The contract also specifies the honeypot profile without converting its numeric score into an invented ordinal. Both profiles share identical canonical encoding, event-ID and `sha256:`-prefixed content-hash rules. Assessment IDs/timestamps still vary between independent invocations; finding rules remain deterministic. Hashes do not prove origin, authorization or authenticity.

The original `schema/evidence-v1.json` and legacy event fixture are retained for historical validation; v2 verifiers reject v1 and never relabel old reports. Anti-ARTEX remains independent: no shared D1, credentials, packages or runtime services. `verifyEvidence` is a pure local verifier of both v2 profiles, not an import endpoint. Normal CI tests both producer fixtures locally. To check both implementations, build both reviewed checkouts and run `npm run test:interop -- /path/to/anti-artex`; it requires identical contract artifacts and checks both real producers and in-process Worker outputs against both schemas/verifiers, with external fetch disabled. See [compatibility results](docs/compatibility-results.md). This establishes synthetic artifact compatibility, not deployed service connectivity.

See [threat model](docs/threat-model.md) and [commercial validation and budget](docs/budget.md). No live assessment, production or commerce readiness is claimed.
