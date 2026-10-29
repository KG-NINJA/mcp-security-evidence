import test from 'node:test';
import assert from 'node:assert/strict';
import { runCaseStudy, formatCaseStudyMarkdown } from '../scripts/retest-case-study.mjs';

test('synthetic before/after metadata assessment creates verifiable, scoped case study', async () => {
  const report = await runCaseStudy();
  assert.equal(report.evidence_contract, '2.0.0');
  assert.equal(report.target_requests_before, 0);
  assert.equal(report.target_requests_after, 0);
  assert.equal(report.baseline_finding_count, 4);
  assert.equal(report.retest_finding_count, 0);
  assert.equal(report.scenarios.length, 4);
  assert.ok(report.scenarios.every(x => x.runtime_status === 'not_tested'));
  assert.ok(report.scenarios.every(x => x.outcome === 'no_longer_reported_in_submitted_metadata'));
  assert.notEqual(report.before_metadata_hash, report.after_metadata_hash);
  const md = formatCaseStudyMarkdown(report);
  assert.match(md, /NOT an actual penetration test/);
  assert.match(md, /No remote MCP server was contacted/);
  assert.doesNotMatch(md, /synthetic-case-study-token/);
});
