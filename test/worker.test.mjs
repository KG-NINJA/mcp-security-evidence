import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import worker from '../dist/index.js';
import { hash, canonical } from '../dist/evidence.js';
import { validateTarget } from '../dist/safety.js';
const fixture = JSON.parse(readFileSync(new URL('../fixtures/authorized-request.json', import.meta.url)));
const validate = new Ajv().compile(JSON.parse(readFileSync(new URL('../schema/evidence-v1.json', import.meta.url))));
const token = 'synthetic-test-token-not-a-secret-12345';
function env() { return { ASSESSMENT_TOKEN: token, AUTHORIZED_SUBJECT: 'synthetic-owner', AUTHORIZED_TARGET: fixture.target, RATE_LIMITER: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } }; }
function request(body = fixture, path = '/assessments', auth = token) {
 return new Request('https://worker.test' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('health explicitly disables probing and commerce', async () => {
 const r = await worker.fetch(new Request('https://worker.test/health'), {});
 assert.equal(r.status, 200); assert.deepEqual(await r.json(), { status: 'ok', mode: 'submitted-metadata-only', live_probing: false, payments: false });
});
test('authorized synthetic sample emits schema-valid, integrity-verifiable evidence', async () => {
 const r = await worker.fetch(request(), env()); assert.equal(r.status, 200);
 const b = await r.json(); assert.equal(b.target_requests, 0); assert.equal(b.events.length, 5);
 assert.deepEqual(b.events.map(e => e.finding_type), ['authentication_not_declared', 'permissive_tool_schema', 'tool_effects_unconfirmed', 'destructive_tool_advertised', 'assessment_scope']);
 for (const e of b.events) { assert.ok(validate(e), JSON.stringify(validate.errors)); const { content_hash, ...body } = e; assert.equal(content_hash, await hash(body)); assert.notEqual(content_hash, await hash({ ...body, severity: 'low' })); }
 assert.match(b.report, /No target was contacted/); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('findings stable across runs, while event identities are unique', async () => {
 const a = await (await worker.fetch(request(), env())).json(), b = await (await worker.fetch(request(), env())).json();
 const semantic = e => ({ type: e.finding_type, evidence: e.evidence, severity: e.severity, remediation: e.remediation });
 assert.deepEqual(a.events.map(semantic), b.events.map(semantic)); assert.notEqual(a.events[0].event_id, b.events[0].event_id);
 assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});
test('missing configuration, invalid token, missing authorization and scope mismatch reject', async () => {
 assert.equal((await worker.fetch(request(), {})).status, 503);
 assert.equal((await worker.fetch(request(fixture, '/assessments', 'wrong'), env())).status, 401);
 for (const authorization of [undefined, { subject: 'other', explicit_authorization: true }, { subject: 'synthetic-owner', explicit_authorization: false }])
  assert.equal((await worker.fetch(request({ ...fixture, authorization }), env())).status, 403);
 assert.equal((await worker.fetch(request({ ...fixture, target: 'https://other.customer.com/mcp' }), env())).status, 403);
});
test('rate limits fail closed, including binding errors', async () => {
 for (const [RATE_LIMITER, status] of [[undefined, 503], [{ getByName: () => ({ fetch: async () => new Response(null, { status: 429 }) }) }, 429], [{ getByName: () => ({ fetch: async () => { throw new Error('offline'); } }) }, 503]])
  assert.equal((await worker.fetch(request(), { ...env(), RATE_LIMITER })).status, status);
});
test('all live modes disabled, with no DNS or fetch even for malicious inputs', async () => {
 const oldFetch = globalThis.fetch; let calls = 0;
 globalThis.fetch = async () => { calls++; throw new Error('External requests forbidden'); };
 try {
  for (const mode of ['live', 'redirect', 'dns-rebinding', 'probe']) assert.equal((await worker.fetch(request({ ...fixture, mode }), env())).status, 422);
  assert.equal((await worker.fetch(request(), env())).status, 200); assert.equal(calls, 0);
 } finally { globalThis.fetch = oldFetch; }
});
test('SSRF target gate blocks internal, metadata, encoded IPs, IPv6 and redirect URLs', () => {
 for (const target of ['http://mcp.customer.com', 'https://localhost', 'https://foo.local', 'https://foo.internal', 'https://metadata.google.internal', 'https://169.254.169.254', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://0177.0.0.1', 'https://10.0.0.1', 'https://172.16.0.1', 'https://192.168.1.1', 'https://100.64.0.1', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[fe80::1]', 'https://[fc00::1]', 'https://customer.com.', 'https://user:pass@customer.com', 'https://customer.com:8443', 'https://customer.com/#fragment', 'https://customer.com/?redirect=http://127.0.0.1'])
  assert.throws(() => validateTarget(target), undefined, target);
 assert.equal(validateTarget(fixture.target), fixture.target);
});
test('invalid schema and bounded body failures', async () => {
 const invalid = [null, {}, { ...fixture, metadata: {} }, { ...fixture, metadata: { ...fixture.metadata, tools: Array(51).fill(fixture.metadata.tools[0]) } }, { ...fixture, metadata: { ...fixture.metadata, tools: [fixture.metadata.tools[0], fixture.metadata.tools[0]] } }, { ...fixture, padding: 'x'.repeat(65536) }, { ...fixture, padding: Array(22).fill(0).reduce(a => [a], null) }];
 for (const body of invalid) assert.equal((await worker.fetch(request(body), env())).status, 400);
 const r = request(); r.headers.set('content-type', 'text/plain'); assert.equal((await worker.fetch(r, env())).status, 400);
 const bad = new Request('https://worker.test/assessments', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{broken' });
 assert.equal((await worker.fetch(bad, env())).status, 400);
});
test('slow streamed request body is cancelled at deadline', async () => {
 let cancelled = false;
 const r = new Request('https://worker.test/assessments', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, duplex: 'half', body: new ReadableStream({ cancel() { cancelled = true; } }) });
 assert.equal((await worker.fetch(r, env())).status, 400); assert.equal(cancelled, true);
});
test('machine-readable and human-readable endpoints require authorization', async () => {
 for (const path of ['/evidence-report', '/report']) {
  assert.equal((await worker.fetch(request(fixture, path, 'wrong'), env())).status, 401);
  const r = await worker.fetch(request(fixture, path), env()); assert.equal(r.status, 200);
  if (path === '/report') { assert.match(r.headers.get('content-type'), /text\/markdown/); assert.match(await r.text(), /Remediation:/); }
  else assert.ok((await r.json()).events.every(e => validate(e)));
 }
 assert.equal((await worker.fetch(new Request('https://worker.test/report'), env())).status, 405);
 assert.equal((await worker.fetch(new Request('https://worker.test/payments'), env())).status, 404);
});
