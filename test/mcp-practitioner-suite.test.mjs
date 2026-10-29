import test from 'node:test';
import assert from 'node:assert/strict';
import { runMcpSuite, startMcpLab } from '../scripts/mcp-practitioner-suite.mjs';

test('32 MCP wire cases compare real loopback responses and state transitions', { timeout: 30000 }, async () => {
  const r = await runMcpSuite();
  assert.equal(r.cases, 32); assert.equal(r.passed, 32);
  assert.equal(r.reproduced_and_blocked, 12);
  const concurrency = r.results.find(x => x.id === 'M13');
  assert.equal(concurrency.fixed.writes, 1); assert.equal(concurrency.weak.writes, 2);
  const serialized = JSON.stringify(r);
  assert.doesNotMatch(serialized, /Bearer |authorization|mcp-session-id|invented-not-issued/);
  assert.ok(r.results.every(x => x.status === 'PASS'));
});
test('fixed request budget rejects the next request without a mutation', async () => {
  const l = await startMcpLab('fixed', 2);
  try {
    const session = await l.initialize();
    const r = await l.wire({ jsonrpc: '2.0', id: 2, method: 'ping' }, { session });
    assert.equal(r.http, 429); assert.equal(l.snapshot().writes, 0);
  } finally { await l.close(); }
});
