const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkChatRateLimit({
  userId,
  notebookId,
  now = Date.now()
}: {
  userId: string;
  notebookId: string;
  now?: number;
}) {
  const key = `${userId}:${notebookId}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS
    });

    return {
      allowed: true,
      remaining: MAX_REQUESTS - 1,
      resetAt: now + WINDOW_MS
    };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt
    };
  }

  bucket.count += 1;

  return {
    allowed: true,
    remaining: MAX_REQUESTS - bucket.count,
    resetAt: bucket.resetAt
  };
}

export function resetChatRateLimitForTests() {
  buckets.clear();
}
