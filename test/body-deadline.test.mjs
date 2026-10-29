import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/authorized-request.json', import.meta.url), 'utf8'));
const token = 'synthetic-deadline-test-only-00000000000000';
function environment() {
  return {
    ASSESSMENT_TOKEN: token, AUTHORIZED_SUBJECT: fixture.authorization.subject, AUTHORIZED_TARGET: fixture.target,
    RATE_LIMITER: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) }
  };
}

test('complete metadata JSON without stream completion is rejected at deadline', { timeout: 10000 }, async () => {
  let cancelled = false;
  const request = new Request('https://worker.test/assessments', {
    method: 'POST', duplex: 'half',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(fixture))); },
      cancel() { cancelled = true; }
    })
  });
  const response = await worker.fetch(request, environment());
  assert.equal(response.status, 400, 'valid JSON alone must not bypass the body-read deadline');
  assert.equal(cancelled, true);
  const body = await response.json();
  assert.equal(Object.hasOwn(body, 'events'), false);
  assert.match(body.error, /deadline/);
});

test('completed metadata request is still assessed', async () => {
  const response = await worker.fetch(new Request('https://worker.test/assessments', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(fixture)
  }), environment());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).target_requests, 0);
});
