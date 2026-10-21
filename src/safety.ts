// Conservative lexical gate only. This does NOT make DNS resolution or fetch safe.
// Live probing remains disabled until a transport can pin vetted public IPs at connection time.
export function validateTarget(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Invalid target');
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || (u.port && u.port !== '443')) throw new Error('HTTPS target without credentials, fragment or custom port required');
  const h = u.hostname.toLowerCase();
  // Reject all IP literals (IPv4 alternate forms are normalized by URL), single-label and internal names.
  if (h.endsWith('.') || h.includes(':') || /^\[/.test(h) || /^[\d.]+$/.test(h) || !h.includes('.') || !/^[a-z0-9.-]+$/.test(h) ||
      h.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /(?:^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(h) ||
      h === 'metadata.google.internal') throw new Error('Target hostname is disallowed');
  if (u.search) throw new Error('Target query strings are not accepted');
  return u.toString();
}
export interface Limiter { getByName(name: string): { fetch(request: Request): Promise<Response> } }
export interface Env {
  ASSESSMENT_TOKEN?: string;
  AUTHORIZED_SUBJECT?: string;
  AUTHORIZED_TARGET?: string;
  RATE_LIMITER?: Limiter;
}
export async function tokenMatches(actual: string, expected: string): Promise<boolean> {
  const encode = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([encode(actual), encode(expected)]);
  return new Uint8Array(a).every((v, i) => v === new Uint8Array(b)[i]);
}
