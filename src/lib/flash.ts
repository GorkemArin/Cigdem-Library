import type { Response } from 'express';
import { config } from '../config.js';
import { cookieOptions, safeEqual, sign } from './security.js';

export type FlashType = 'success' | 'error' | 'info';

export interface FlashMessage {
  type: FlashType;
  message: string;
}

interface FlashPayload extends FlashMessage {
  exp: number;
}

export function setFlash(res: Response, type: FlashType, message: string): void {
  const payload: FlashPayload = { type, message, exp: Date.now() + 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  res.cookie(config.flashCookieName, `${encoded}.${sign(encoded)}`, cookieOptions(60));
}

export function readFlash(
  value: string | undefined,
  res: Response,
): FlashMessage | null {
  if (!value) return null;

  res.clearCookie(config.flashCookieName, { path: '/' });

  const separator = value.lastIndexOf('.');
  if (separator === -1) return null;

  const encoded = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!safeEqual(sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<FlashPayload>;

    if (
      payload.exp &&
      payload.exp > Date.now() &&
      typeof payload.message === 'string' &&
      (payload.type === 'success' || payload.type === 'error' || payload.type === 'info')
    ) {
      return { type: payload.type, message: payload.message };
    }
  } catch {
    return null;
  }

  return null;
}
