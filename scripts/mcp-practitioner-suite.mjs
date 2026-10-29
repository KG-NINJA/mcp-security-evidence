// Reproducible before/after checks against the contained MCP wire lab.
import assert from 'node:assert/strict';
import { startMcpLab, PROTOCOL } from './mcp-lab-server.mjs';
export { startMcpLab, PROTOCOL };
const LIMIT = 8192;

const call = (lab, session, actor, name, args, headers = {}) => lab.wire({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }, { actor, session, headers });
const observation = (response, lab) => ({ http: response.http, code: response.code, writes: lab.snapshot().writes });
function cases() {
  const list = [];
  const add = (id, title, expectedWeak, expectedFixed, run, reference = 'control') => list.push({ id, title, expectedWeak, expectedFixed, run, reference });
  const exp = (code, writes = 0, http = 200) => ({ http, code, writes });
  add('M01', 'Own-tenant read', exp('READ'), exp('READ'), async l => call(l, await l.initialize(), 'reader', 'read_record', { record_id: 'A1' }));
  add('M02', 'Cross-tenant read', exp('READ'), exp('OBJECT_DENIED'), async l => call(l, await l.initialize(), 'reader', 'read_record', { record_id: 'B1' }), 'OWASP API1:2023');
  add('M03', 'Reader cannot write', exp('UPDATED', 1), exp('ROLE_DENIED'), async l => call(l, await l.initialize(), 'reader', 'set_note', { record_id: 'A1', note: 'fictional' }), 'OWASP API5:2023');
  add('M04', 'Untrusted role headers do not grant write', exp('UPDATED', 1), exp('ROLE_DENIED'), async l => call(l, await l.initialize(), 'reader', 'set_note', { record_id: 'A1', note: 'fictional' }, { 'x-role': 'admin', 'x-read-only-hint': 'false' }), 'OWASP API5:2023');
  add('M05', 'Cross-tenant write', exp('UPDATED', 1), exp('OBJECT_DENIED'), async l => call(l, await l.initialize('writer'), 'writer', 'set_note', { record_id: 'B1', note: 'fictional' }), 'OWASP API1:2023');
  for (const [id, title, type] of [['M06', 'Missing approval', 'none'], ['M07', 'Invented approval', 'fake'], ['M08', 'Expired approval', 'expired'], ['M09', 'Approval bound to record', 'record'], ['M10', 'Approval bound to actor', 'actor'], ['M11', 'Approval bound to session', 'session']]) {
    add(id, title, exp('UPDATED', 1), exp('APPROVAL_DENIED'), async l => {
      let actor = 'writer', session = await l.initialize(actor), approval;
      if (type === 'fake') approval = 'invented-not-issued';
      else if (type !== 'none') approval = l.approve(actor, session, type === 'record' ? 'A2' : 'A1');
      if (type === 'expired') l.advance(2000);
      if (type === 'actor') { actor = 'colleague'; session = await l.initialize(actor); }
      if (type === 'session') session = await l.initialize(actor);
      return call(l, session, actor, 'set_note', { record_id: 'A1', note: 'fictional', ...(approval ? { approval } : {}) });
    }, 'server-side approval');
  }
  add('M12', 'One approval permits exactly one write to an existing record', exp('UPDATED', 2), exp('APPROVAL_DENIED', 1), async l => {
    const s = await l.initialize('writer'), approval = l.approve('writer', s);
    assert.equal((await call(l, s, 'writer', 'set_note', { record_id: 'A1', note: 'first', approval })).code, 'UPDATED');
    return call(l, s, 'writer', 'set_note', { record_id: 'A1', note: 'second', approval });
  }, 'replay prevention');
  add('M13', 'Concurrent reuse has only one successful write', exp('UPDATED,UPDATED', 2), exp('APPROVAL_DENIED,UPDATED', 1), async l => {
    const s = await l.initialize('writer'), approval = l.approve('writer', s);
    const responses = await Promise.all([1, 2].map(() => call(l, s, 'writer', 'set_note', { record_id: 'A1', note: 'concurrent', approval })));
    return { http: 200, code: responses.map(x => x.code).sort().join(',') };
  }, 'replay prevention');
  add('M14', 'Fresh approval permits a later legitimate write', exp('UPDATED', 2), exp('UPDATED', 2), async l => {
    const s = await l.initialize('writer');
    assert.equal((await call(l, s, 'writer', 'set_note', { record_id: 'A1', note: 'first', approval: l.approve('writer', s) })).code, 'UPDATED');
    return call(l, s, 'writer', 'set_note', { record_id: 'A1', note: 'second', approval: l.approve('writer', s) });
  });
  add('M15', 'Unauthenticated request', exp('UNAUTHENTICATED', 0, 401), exp('UNAUTHENTICATED', 0, 401), l => l.wire({}, { actor: 'nobody' }));
  add('M16', 'Session belongs to authenticated actor', exp('SESSION_NOT_FOUND', 0, 404), exp('SESSION_NOT_FOUND', 0, 404), async l => call(l, await l.initialize('writer'), 'outsider', 'read_record', { record_id: 'A1' }));
  add('M17', 'Expired session', exp('SESSION_NOT_FOUND', 0, 404), exp('SESSION_NOT_FOUND', 0, 404), async l => { const s = await l.initialize(); l.advance(60001); return call(l, s, 'reader', 'read_record', { record_id: 'A1' }); });
  add('M18', 'Initialization notification required', exp('NOT_INITIALIZED', 0, 400), exp('NOT_INITIALIZED', 0, 400), async l => call(l, await l.initialize('reader', false), 'reader', 'read_record', { record_id: 'A1' }));
  add('M19', 'Client cannot self-assert approval with an extra field', exp('BAD_ARGUMENTS'), exp('BAD_ARGUMENTS'), async l => call(l, await l.initialize('writer'), 'writer', 'set_note', { record_id: 'A1', note: 'fictional', authorized: true }));
  add('M20', 'Browser Origin rejected', exp('ORIGIN_OR_HOST', 0, 403), exp('ORIGIN_OR_HOST', 0, 403), l => l.wire({}, { headers: { origin: 'https://untrusted.invalid' } }));
  add('M21', 'Unexpected Host rejected', exp('ORIGIN_OR_HOST', 0, 403), exp('ORIGIN_OR_HOST', 0, 403), l => l.wire({}, { headers: { host: 'untrusted.invalid' } }));
  add('M22', 'Oversized body', exp('BODY_LIMIT', 0, 413), exp('BODY_LIMIT', 0, 413), l => l.wire({}, { raw: ' '.repeat(LIMIT + 1) }));
  add('M23', 'Malformed JSON', exp('INVALID_JSON', 0, 400), exp('INVALID_JSON', 0, 400), l => l.wire({}, { raw: '{' }));
  add('M24', 'Invalid UTF-8', exp('INVALID_JSON', 0, 400), exp('INVALID_JSON', 0, 400), l => l.wire({}, { raw: Buffer.from([0xff]) }));
  add('M25', 'Complete JSON on unfinished stream fails at deadline', exp('BODY_DEADLINE', 0, 408), exp('BODY_DEADLINE', 0, 408), l => l.wire({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL } }, { unfinished: true }));
  add('M26', 'JSON-RPC batch unsupported', exp('INVALID_RPC', 0, 400), exp('INVALID_RPC', 0, 400), l => l.wire([]));
  add('M27', 'Unsupported protocol rejected', exp('PROTOCOL_VERSION', 0, 400), exp('PROTOCOL_VERSION', 0, 400), async l => call(l, await l.initialize(), 'reader', 'read_record', { record_id: 'A1' }, { 'mcp-protocol-version': 'invalid' }));
  add('M28', 'Unknown tool is protocol error', exp('UNKNOWN_TOOL'), exp('UNKNOWN_TOOL'), async l => call(l, await l.initialize(), 'reader', 'unknown_tool', {}));
  add('M29', 'Tool invocation notification cannot mutate state', exp('UNSUPPORTED_NOTIFICATION', 0, 400), exp('UNSUPPORTED_NOTIFICATION', 0, 400), async l => l.wire({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'set_note', arguments: { record_id: 'A1', note: 'fictional' } } }, { actor: 'writer', session: await l.initialize('writer') }));
  add('M30', 'Session termination enforced', exp('SESSION_NOT_FOUND', 0, 404), exp('SESSION_NOT_FOUND', 0, 404), async l => { const s = await l.initialize(); assert.equal((await l.wire({}, { method: 'DELETE', session: s })).http, 204); return call(l, s, 'reader', 'read_record', { record_id: 'A1' }); });
  add('M31', 'Tool listing uses MCP', exp('OK'), exp('OK'), async l => { const r = await l.wire({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { session: await l.initialize() }); assert.deepEqual(r.body.result.tools.map(t => t.name), ['read_record', 'set_note']); return r; });
  add('M32', 'Encoded request body rejected', exp('ENCODING', 0, 415), exp('ENCODING', 0, 415), l => l.wire({}, { headers: { 'content-encoding': 'gzip' } }));
  return list;
}

export async function runMcpSuite() {
  const results = [];
  for (const scenario of cases()) {
    const observations = {};
    for (const profile of ['weak', 'fixed']) {
      const lab = await startMcpLab(profile);
      try {
        const response = await scenario.run(lab);
        observations[profile] = { ...observation(response, lab), transcript: lab.trace };
        assert.deepEqual(observation(response, lab), profile === 'weak' ? scenario.expectedWeak : scenario.expectedFixed, scenario.id + ':' + profile);
      } finally { await lab.close(); }
    }
    results.push({ id: scenario.id, title: scenario.title, reference: scenario.reference, ...observations, status: 'PASS',
      classification: JSON.stringify(scenario.expectedWeak) === JSON.stringify(scenario.expectedFixed) ? 'control' : 'reproduced_and_blocked_in_lab' });
  }
  return { schema_version: 'mcp-practitioner-lab/1.0', protocol_revision: PROTOCOL, cases: results.length,
    passed: results.length, reproduced_and_blocked: results.filter(x => x.classification !== 'control').length,
    results, scope: 'self-owned ephemeral loopback MCP, fictional data, no arbitrary target URL',
    limitations: ['Pinned legacy MCP subset; not complete protocol or OAuth conformance.', 'Weak policy is deliberately constructed, not an independently discovered customer vulnerability.', 'Approval is issued by the test harness, not a production human-consent service.', 'No LLM, live scan, real credentials, commercial pentest, or deployment is involved.'] };
}
