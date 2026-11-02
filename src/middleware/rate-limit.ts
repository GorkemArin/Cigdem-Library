import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function cleanup(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimitKey(req: Request, scope: string): string {
  return `${scope}:${req.ip ?? 'unknown'}`;
}

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return false;
  return bucket.count >= max;
}

export function registerRateLimitFailure(key: string, windowMs: number): void {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function rateLimit(
  scope: string,
  max: number,
  windowMs: number,
  message = 'Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (isRateLimited(rateLimitKey(req, scope), max, windowMs)) {
      next(new HttpError(429, message));
      return;
    }
    next();
  };
}
