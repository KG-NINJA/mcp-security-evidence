import { readdirSync, readFileSync } from 'node:fs';

export const PORT = 3000;
export const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Test the original input as well as the parsed URL: URL() normalizes numeric and encoded hosts. */
export function inScope(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length > 4096 || !/^http:\/\/127\.0\.0\.1:3000(?:[/?#]|$)/.test(raw)) return false;
  try {
    const u = new URL(raw);
    return u.origin === ORIGIN && !u.username && !u.password && u.hostname === '127.0.0.1' && u.port === String(PORT);
  } catch { return false; }
}

export function allowedRequest(url: string, method: string, redirected: boolean): boolean {
  return !redirected && method === 'GET' && inScope(url);
}

/** Linux-only fail-closed check. This is defense in depth, not an attestation against privileged host tampering. */
export function assertNetworkIsolation(): void {
  if (process.platform !== 'linux') throw new Error('ISOLATION_UNVERIFIED');
  let names: string[];
  try { names = readdirSync('/sys/class/net'); } catch { throw new Error('ISOLATION_UNVERIFIED'); }
  if (names.length !== 1 || names[0] !== 'lo') throw new Error('ISOLATION_REQUIRED');
}

/** Require the lab listener itself, not just the client, to bind IPv4 loopback. */
export function assertLoopbackListener(): void {
  const expected = PORT.toString(16).toUpperCase().padStart(4, '0');
  let v4: string; let v6: string;
  try { v4 = readFileSync('/proc/net/tcp', 'utf8'); v6 = readFileSync('/proc/net/tcp6', 'utf8'); }
  catch { throw new Error('LISTENER_UNVERIFIED'); }
  let found = false;
  for (const [text, ipv6] of [[v4, false], [v6, true]] as const) {
    for (const line of text.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/);
      const local = columns[1]; const state = columns[3];
      if (!local || state !== '0A') continue;
      const [address, port] = local.split(':');
      if (port !== expected) continue;
      if (ipv6 || address !== '0100007F') throw new Error('LISTENER_NOT_LOOPBACK');
      found = true;
    }
  }
  if (!found) throw new Error('LOOPBACK_LISTENER_MISSING');
}
