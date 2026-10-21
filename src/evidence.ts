export type Severity = 'info' | 'low' | 'medium' | 'high';
export interface Evidence {
  schema_version: '1'; event_id: string; observed_at: string;
  source_type: 'submitted_mcp_metadata'; assessment_id: string;
  finding_type: string; severity: Severity;
  evidence: { path: string; observation: string };
  confidence: 'high' | 'medium' | 'low'; limitations: string[];
  remediation: string; content_hash: string;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return 'sha256:' + Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export type Metadata = {
  capabilities: Record<string, unknown>;
  tools: Array<{ name: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> }>;
  publicConfiguration: { authentication: 'required' | 'none' | 'unknown'; transport: 'https' | 'stdio' | 'unknown' };
};
export async function assess(metadata: Metadata, assessmentId: string, now: string): Promise<Evidence[]> {
  const findings: Evidence[] = [];
  async function add(finding_type: string, severity: Severity, path: string, observation: string, remediation: string) {
    const body: Omit<Evidence, 'content_hash'> = {
      schema_version: '1', event_id: crypto.randomUUID(), observed_at: now,
      source_type: 'submitted_mcp_metadata', assessment_id: assessmentId, finding_type, severity,
      evidence: { path, observation }, confidence: 'medium',
      limitations: ['Submitted metadata only; provenance and live server behavior are not verified.',
        'Tool annotations are untrusted hints; no tools were invoked.'], remediation,
    };
    findings.push({ ...body, content_hash: await hash(body) });
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
