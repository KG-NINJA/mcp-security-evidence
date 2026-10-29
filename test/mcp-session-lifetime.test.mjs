import test from 'node:test';
import assert from 'node:assert/strict';
import { startMcpLab } from '../scripts/mcp-lab-server.mjs';

for (const invalidation of ['delete', 'expire']) {
  for (const operation of ['write', 'notification']) {
    test(`${invalidation} during body read rejects ${operation} without mutation`, { timeout: 10000 }, async () => {
      const lab = await startMcpLab();
      try {
        const actor = 'writer', session = await lab.initialize(actor, operation !== 'notification');
        const approval = lab.approve(actor, session);
        const message = operation === 'write'
          ? { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'set_note', arguments: { record_id: 'A1', note: 'must not be written', approval } } }
          : { jsonrpc: '2.0', method: 'notifications/initialized' };
        const before = lab.snapshot();
        const result = await lab.wire(message, { actor, session, beforeBodyEnd: async () => {
          if (invalidation === 'delete') {
            assert.equal((await lab.wire(null, { actor, session, method: 'DELETE' })).http, 204);
          } else lab.advance(60000);
        } });
        assert.equal(result.http, 404);
        assert.equal(result.code, 'SESSION_NOT_FOUND');
        assert.deepEqual(lab.snapshot(), before);
        assert.equal((await lab.wire({ jsonrpc: '2.0', id: 3, method: 'ping' }, { actor, session })).http, 404);
        const fresh = await lab.initialize(actor);
        assert.equal((await lab.wire({ jsonrpc: '2.0', id: 4, method: 'ping' }, { actor, session: fresh })).http, 200);
      } finally { await lab.close(); }
    });
  }
}
