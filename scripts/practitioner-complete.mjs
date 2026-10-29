import assert from 'node:assert/strict';
import { runMcpSuite } from './mcp-practitioner-suite.mjs';
import { runCaseStudy } from './retest-case-study.mjs';
import { provenance, writeBundle } from './portfolio-bundle.mjs';
assert.equal(process.argv.length, 2, 'This command accepts no target, URL or credential arguments');
const mcp = await runMcpSuite();
const metadata = await runCaseStudy();
const report = {
  title: 'MCP Security Evidence — Practitioner Portfolio v1', scope: 'synthetic-local-only',
  generated_at: new Date().toISOString(), source: provenance(),
  rows: [...mcp.results.map(x => ({ id: x.id + ': ' + x.title, status: x.status })),
    { id: 'Metadata-only retest', status: `${metadata.baseline_finding_count} → ${metadata.retest_finding_count}; runtime not assessed` }],
  mcp, metadata, limitations: [...mcp.limitations,
    'Metadata fixes are not proof of repaired runtime behavior.',
    'SHA-256 verifies stored bytes, not author identity or source authenticity.',
    'No paid API usage, Cloudflare deployment or commercial testing experience is claimed.']
};
console.log(JSON.stringify({ cases: mcp.cases, passed: mcp.passed, reproduced_in_lab: mcp.reproduced_and_blocked, bundle: writeBundle(report) }, null, 2));
