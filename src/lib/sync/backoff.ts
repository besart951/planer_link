export interface BackoffOptions {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
  jitterRatio?: number;
}

export function retryDelayMs({
  attempt,
  baseMs = 500,
  maxMs = 30_000,
  jitterRatio = 0.25
}: BackoffOptions): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  const jitter = exponential * jitterRatio * Math.random();
  return Math.round(exponential + jitter);
}
