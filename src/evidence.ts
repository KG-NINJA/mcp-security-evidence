import { EVIDENCE_VERSION, digest, sealEvidence, type MetadataEvidence, type Severity } from './evidence-contract.js';
export { canonical, verifyEvidence, type Severity } from './evidence-contract.js';
export type Evidence = MetadataEvidence;
export async function hash(value: unknown): Promise<string> {
  return 'sha256:' + await digest(value);
}
export type Metadata = {
  capabilities: Record<string, unknown>;
  tools: Array<{ name: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> }>;
  publicConfiguration: { authentication: 'required' | 'none' | 'unknown'; transport: 'https' | 'stdio' | 'unknown' };
};
export async function assess(metadata: Metadata, assessmentId: string, now: string): Promise<Evidence[]> {
  const findings: Evidence[] = [];
  async function add(finding_type: string, severity: Severity, path: string, observation: string, remediation: string) {
    const body: Omit<Evidence, 'event_id' | 'content_hash'> = {
      schema_version: EVIDENCE_VERSION, observed_at: now,
      source_type: 'submitted_mcp_metadata', assessment_id: assessmentId, finding_type, severity,
      evidence: { path, observation }, confidence: { scale: 'ordinal', value: 'medium' },
      limitations: ['Submitted metadata only; provenance and live server behavior are not verified.',
        'Tool annotations are untrusted hints; no tools were invoked.'], remediation,
    };
    findings.push(await sealEvidence(body));
  }
  if (metadata.publicConfiguration.authentication === 'none')
    await add('authentication_not_declared', 'high', '/publicConfiguration/authentication', 'Submitted configuration declares no authentication.', 'Require authenticated access and enforce per-tool authorization.');
  if (metadata.publicConfiguration.authentication === 'unknown')
    await add('authentication_unknown', 'info', '/publicConfiguration/authentication', 'Authentication configuration was not supplied.', 'Review authentication configuration before exposure.');
  if (Object.keys(metadata.capabilities).some(k => !['tools', 'resources', 'prompts', 'logging', 'completions', 'experimental'].includes(k)))
    await add('unrecognized_capability', 'low', '/capabilities', 'Unrecognized capability keys are present.', 'Review advertised capabilities against the negotiated MCP protocol version.');
  for (const [i, tool] of metadata.tools.entries()) {
    if (tool.inputSchema.type !== 'object' || tool.inputSchema.additionalProperties !== false)
      await add('permissive_tool_schema', 'medium', `/tools/${i}/inputSchema`, 'Tool schema does not explicitly restrict inputs to a closed object.', 'Use an object schema with additionalProperties:false and validate inputs at runtime.');
    if (tool.annotations?.readOnlyHint !== true)
      await add('tool_effects_unconfirmed', 'info', `/tools/${i}/annotations`, 'Tool is not explicitly annotated read-only.', 'Document tool effects and require explicit authorization for state-changing operations.');
    if (tool.annotations?.destructiveHint === true)
      await add('destructive_tool_advertised', 'medium', `/tools/${i}/annotations/destructiveHint`, 'Tool advertises destructive behavior.', 'Restrict access and require confirmation before invoking destructive tools.');
  }
  await add('assessment_scope', 'info', '/', `${metadata.tools.length} tool schemas reviewed; zero target requests made.`, 'Validate findings with the system owner; this report is not a compliance certification.');
  return findings;
}
export function renderReport(events: Evidence[]): string {
  return '# MCP Security Evidence report\n\nMetadata-only review. No target was contacted.\n\n' + events.map(e =>
    `## ${e.finding_type} (${e.severity})\n\n${e.evidence.observation}\n\nRemediation: ${e.remediation}\n\nLimitations: ${e.limitations.join(' ')}\n`).join('\n');
}
