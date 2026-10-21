interface Transaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
interface State {
  storage: { transaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> };
}
// One stable Durable Object ID across the deployment, all routes and subjects.
// Transaction serializes updates and persists quota across isolate restarts.
export class GlobalRateLimiter {
  constructor(private readonly state: State) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const allowed = await this.state.storage.transaction(async txn => {
      const now = Date.now();
      const previous = await txn.get<number[]>('timestamps') ?? [];
      // Retain future timestamps if the clock moves backwards: fail conservatively.
      const recent = previous.filter(t => now - t < 60_000);
      if (recent.length >= 5) return false;
      await txn.put('timestamps', [...recent, now]);
      return true;
    });
    return new Response(null, { status: allowed ? 204 : 429 });
  }
}
