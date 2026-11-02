import type { SessionUser } from '../db/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      cookies: Record<string, string>;
    }
  }
}

export {};
