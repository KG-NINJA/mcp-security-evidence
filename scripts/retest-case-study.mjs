// Reproducible, local-only before/after security assessment of fictional MCP metadata.
// No target network access, no scanner, no deployment, no sensitive credentials.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../dist/index.js';
import { verifyEvidence } from '../dist/evidence.js';

const secret = 'synthetic-case-study-token-000000000000000';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/authorized-request.json', import.meta.url), 'utf8'));
const scope = 'local synthetic submitted-metadata assessment only; zero target requests';
function demoEnv() {
  return {
    ASSESSMENT_TOKEN: secret, AUTHORIZED_SUBJECT: 'synthetic-owner',
    AUTHORIZED_TARGET: fixture.target,
    // In-process-only rate limiter stub, never a production binding.
    RATE_LIMITER: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) }
  };
}
async function assessLocal(input) {
  const response = await worker.fetch(new Request('https://worker.test/assessments', {
    method: 'POST', headers: {
      Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json'
    }, body: JSON.stringify(input)
  }), demoEnv());
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.target_requests, 0);
  assert.equal(report.mode, 'submitted-metadata');
  for (const event of report.events) assert.equal(await verifyEvidence(event), true);
  return report;
}
function fingerprint(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export async function runCaseStudy() {
  const before = structuredClone(fixture);
  const after = structuredClone(fixture);
  // Demonstration edits only. No actual MCP runtime configuration is changed.
  after.metadata.publicConfiguration.authentication = 'required';
  after.metadata.tools[0].inputSchema.additionalProperties = false;
  // Remove an advertised destructive tool from the example inventory.
  // Merely changing its annotation would not prove that the runtime is safe.
  after.metadata.tools = after.metadata.tools.filter(t => t.name !== 'delete_record');

  const [baseline, retest] = await Promise.all([assessLocal(before), assessLocal(after)]);
  const active = report => report.events.filter(e => e.finding_type !== 'assessment_scope');
  const baselineFindings = active(baseline);
  const retestFindings = active(retest);
  const scenarios = [
    { id: 'AUTH-001', finding: 'authentication_not_declared',
      control: 'Require auth in submitted public configuration',
      implementation: 'Changed authentication declaration from none to required',
      limitation: 'No live authentication enforcement was verified' },
    { id: 'SCHEMA-001', finding: 'permissive_tool_schema',
      control: 'Close tool input objects',
      implementation: 'Specified additionalProperties:false on search input schema',
      limitation: 'Runtime request validation was not observed' },
    { id: 'TOOL-001', finding: 'destructive_tool_advertised',
      control: 'Remove unneeded destructive tool',
      implementation: 'Removed delete_record from submitted tool inventory',
      limitation: 'Actual deployment and access control were not verified' },
    { id: 'HINT-001', finding: 'tool_effects_unconfirmed',
      control: 'Review declared tool side effects',
      implementation: 'Removed the tool with missing read-only annotation',
      limitation: 'Tool annotations are untrusted; behavior was not verified' }
  ].map(x => {
    const original = baselineFindings.find(e => e.finding_type === x.finding);
    assert.ok(original, 'Baseline finding must be present: ' + x.finding);
    const repeat = retestFindings.find(e => e.finding_type === x.finding);
    return {
      ...x, baseline: {
        severity: original.severity, path: original.evidence.path,
        observation: original.evidence.observation, event_id: original.event_id,
        content_hash: original.content_hash
      },
      retest_finding_present: Boolean(repeat),
      outcome: repeat ? 'still_reported_in_submitted_metadata' : 'no_longer_reported_in_submitted_metadata',
      runtime_status: 'not_tested'
    };
  });
  assert.equal(retestFindings.length, 0);
  assert.equal(scenarios.length, 4);
  assert.ok(scenarios.every(x => !x.retest_finding_present));
  return {
    schema: 'mcp-metadata-retest-case-study/v1', scope,
    subject: 'synthetic-owner', target: fixture.target,
    owner_authorization: 'synthetic fixture; no real owner authorization implied',
    evidence_contract: baseline.schema_version,
    before_metadata_hash: fingerprint(before.metadata),
    after_metadata_hash: fingerprint(after.metadata),
    baseline_finding_count: baselineFindings.length,
    retest_finding_count: retestFindings.length,
    target_requests_before: baseline.target_requests,
    target_requests_after: retest.target_requests,
    before_assessment_id: baseline.assessment_id,
    after_assessment_id: retest.assessment_id,
    scenarios,
    conclusion: 'All four example metadata findings disappear after an example metadata edit; this is not proof of repaired runtime security.',
    limitations: [
      'No remote MCP server was contacted and no tool was executed.',
      'The submitted before/after snapshots are fictional and may not match a real deployment.',
      'SHA-256 records integrity of evidence, not provenance or truth.',
      'A qualified practitioner must independently reproduce and document actual security issues on an authorized target.'
    ]
  };
}
export function formatCaseStudyMarkdown(report) {
  const lines = [
    '# MCP metadata — example security case study', '',
    '**Scope:** ' + report.scope,
    '**Target:** fictional fixture (' + report.target + ')',
    '**Authorization:** ' + report.owner_authorization,
    '**This is NOT an actual penetration test or a validated remediation.**', '',
    '## Reproduction', '',
    '1. Submit the versioned local fixture to the in-process Worker.',
    '2. Preserve the schema-valid evidence IDs, hashes, JSON pointers and findings.',
    '3. Apply the synthetic metadata-only edits and repeat the same assessment.',
    '4. Compare finding IDs, record remaining issues and state untested runtime conditions.', '',
    `Baseline findings: **${report.baseline_finding_count}**. After metadata edit: **${report.retest_finding_count}**.`,
    `Target requests: **${report.target_requests_before} before / ${report.target_requests_after} after**.`, '',
    '| Case | Severity | JSON pointer | Reported after metadata edit? |',
    '|---|---|---|---|',
    ...report.scenarios.map(x => `| ${x.id} | ${x.baseline.severity} | \`${x.baseline.path}\` | ${x.retest_finding_present ? 'yes' : 'no'} |`),
    '', '## Evidence and remediation', ''
  ];
  for (const finding of report.scenarios) {
    lines.push(
      `### ${finding.id}: ${finding.control}`, '',
      `- Observed metadata: ${finding.baseline.observation}`,
      `- Evidence ID: \`${finding.baseline.event_id}\``,
      `- Evidence content hash: \`${finding.baseline.content_hash}\``,
      `- Demonstration change: ${finding.implementation}`,
      `- Retest: ${finding.outcome}`,
      `- Real environment: ${finding.runtime_status} — ${finding.limitation}`, ''
    );
  }
  lines.push('## Conclusion', '', report.conclusion, '', '## Limitations', '',
    ...report.limitations.map(x => '- ' + x), '');
  return lines.join('\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runCaseStudy();
  const out = resolve('artifacts/security-case-study');
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(resolve(out, 'report.md'), formatCaseStudyMarkdown(report));
  console.log(formatCaseStudyMarkdown(report));
}
