# Commercial validation and cost ceiling

Proposed offer: a **$29 one-time advisory report**, reviewing authorized MCP capabilities, tool input schemas and declared public configuration. Clearly disclose metadata-only scope and human-review limitations. No exploit testing or compliance guarantees. Validate interest before engineering commerce: operator-led interviews and a manually counted, opt-in waitlist outside this Worker. Track invitations, qualified interest, willingness to pay $29, requested scope and cancellation reasons. Initial decision gate: ten qualified interviews and at least three explicit purchase-intent statements. Do not collect card data or charge anyone during validation.

There is no checkout, x402 endpoint, payment SDK, billing integration, wallet support or payment activation flag. Adding commerce is a separate explicit approval task.

## Planning estimate (not a provider quote)

Assume 1,000 reports/month, 5 observations/report, 20 ms CPU/report, <64 KiB input, <32 KiB output, no storage/AI/target network calls. That is roughly 20 CPU-seconds and 32 MiB output/month before platform overhead; local validation costs no target traffic. Allow a provisional $5–$10/month hosting budget plus human review time (e.g. 10 minutes/report), domain and tax/support costs. Confirm current Cloudflare pricing/limits before any launch; these figures are assumptions, not verified current prices. Paid hosting and production activation are not part of this task.

At $29 × 1,000, gross hypothetical sales would be $29,000 before all costs; this is scenario math, not a revenue forecast. At 10 minutes/report, human review would require about 167 hours/month and dominates costs. Start with interviews and synthetic examples.

A hard provider/account spend ceiling and kill switch must precede public exposure. The included global Durable Object caps assessments at five per rolling minute, but does not cap provider ingress costs. Current default has no authorization credentials/scope and returns 503; live probing and commerce remain disabled.
