import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http.js';
import { setFlash } from '../lib/flash.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    setFlash(res, 'error', 'Bu sayfayı görüntülemek için giriş yapmalısınız.');
    const nextPath = encodeURIComponent(req.originalUrl);
    res.redirect(`/giris?next=${nextPath}`);
    return;
  }
  next();
}

export function requireGuest(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    res.redirect(req.user.role === 'admin' ? '/admin' : '/hesabim');
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    setFlash(res, 'error', 'Yönetim paneline erişmek için giriş yapmalısınız.');
    res.redirect(`/giris?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (req.user.role !== 'admin' || req.user.status !== 'active') {
    next(new HttpError(403, 'Bu sayfaya erişim yetkiniz yok.'));
    return;
  }
  next();
}

export function requireActiveMember(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    setFlash(res, 'error', 'Ödünç talebi için giriş yapmalısınız.');
    res.redirect(`/giris?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (req.user.role !== 'member' || req.user.status !== 'active') {
    setFlash(
      res,
      'error',
      'Ödünç talebi oluşturmak için üyeliğinizin yönetici tarafından onaylanmış olması gerekir.',
    );
    res.redirect(req.user.role === 'admin' ? '/admin' : '/hesabim');
    return;
  }
  next();
}
