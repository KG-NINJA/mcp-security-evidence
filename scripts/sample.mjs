import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import worker from '../dist/index.js';
const body = readFileSync(new URL('../fixtures/authorized-request.json', import.meta.url), 'utf8');
const response = await worker.fetch(new Request('https://worker.test/assessments', {
 method: 'POST', headers: { Authorization: 'Bearer synthetic-demo-token-not-a-secret-12345', 'Content-Type': 'application/json' }, body,
}), {
 ASSESSMENT_TOKEN: 'synthetic-demo-token-not-a-secret-12345', AUTHORIZED_SUBJECT: 'synthetic-owner', AUTHORIZED_TARGET: JSON.parse(body).target,
 // Synthetic in-process fixture only. Never use this stub in a deployed Worker.
 RATE_LIMITER: { getByName: () => ({ fetch: async () => new Response(null, { status: 204 }) }) },
});
if (!response.ok) throw new Error(`Sample failed: ${response.status}`);
const report = await response.json();
mkdirSync('docs/examples', { recursive: true });
writeFileSync('docs/examples/evidence-report.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync('docs/examples/report.md', report.report);
console.log(`${report.events.length} evidence events; ${report.target_requests} target requests`);
