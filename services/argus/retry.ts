export async function withRetry<T>(operation: () => Promise<T>, options: { attempts?: number; timeoutMs?: number } = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))]); }
    catch (error) { last = error; }
    finally { clearTimeout(timer); }
  }
  throw last instanceof Error ? last : new Error('source failed');
}
