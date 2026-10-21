import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobalRateLimiter } from '../dist/limiter.js';
test('persistent global sliding window permits five, rejects excess and recovers after 60s', async () => {
 const store = new Map(); let queue = Promise.resolve();
 const state = { storage: { transaction(fn) {
  const run = queue.then(() => fn({ get: async k => store.get(k), put: async (k,v) => { store.set(k,v); } }));
  queue = run.catch(() => {}); return run;
 } } };
 const post = () => new Request('https://limiter.internal', { method: 'POST' });
 const original = Date.now; let now = 100000; Date.now = () => now;
 try {
  const limiter = new GlobalRateLimiter(state);
  const results = await Promise.all(Array.from({ length: 20 }, () => limiter.fetch(post())));
  assert.equal(results.filter(r => r.status === 204).length, 5);
  assert.equal(results.filter(r => r.status === 429).length, 15);
  const restarted = new GlobalRateLimiter(state);
  now += 59999; assert.equal((await restarted.fetch(post())).status, 429);
  now += 1; assert.equal((await restarted.fetch(post())).status, 204);
  now -= 100000; // clock regression does not reset quota
  for (let i = 0; i < 4; i++) assert.equal((await restarted.fetch(post())).status, 204);
  assert.equal((await restarted.fetch(post())).status, 429);
  assert.equal((await restarted.fetch(new Request('https://limiter.internal'))).status, 405);
 } finally { Date.now = original; }
});
