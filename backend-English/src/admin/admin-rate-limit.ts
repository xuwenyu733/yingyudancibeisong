/** 简单内存限流：按用户名限制登录尝试 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function assertLoginAllowed(username: string) {
  const key = username.trim().toLowerCase();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return;
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    const mins = Math.ceil((bucket.resetAt - now) / 60000);
    throw new Error(`尝试过多，请 ${mins} 分钟后再试`);
  }
}

export function recordLoginFailure(username: string) {
  const key = username.trim().toLowerCase();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(username: string) {
  buckets.delete(username.trim().toLowerCase());
}
