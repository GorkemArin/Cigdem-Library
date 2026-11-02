import { Router } from 'express';
import { config } from '../config.js';
import { createSession, cleanupSessions, deleteSession } from '../lib/sessions.js';
import { findUserByEmail, createUser } from '../repos/users.js';
import { hashPassword, verifyPassword } from '../lib/security.js';
import { loginSchema, registerSchema } from '../lib/validation.js';
import { zodFieldErrors, safeRedirect, formString } from '../lib/http.js';
import { cookieOptions } from '../lib/security.js';
import { setFlash } from '../lib/flash.js';
import { requireGuest } from '../middleware/auth.js';
import { rateLimitKey, registerRateLimitFailure, clearRateLimit, isRateLimited } from '../middleware/rate-limit.js';

export const authRouter = Router();

const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginRedirectFor(role: string): string {
  return role === 'admin' ? '/admin' : '/hesabim';
}

authRouter.get('/giris', requireGuest, (req, res) => {
  res.render('auth/login', {
    title: 'Giriş yap',
    errors: {},
    values: { email: '' },
    next: safeRedirect(req.query.next, ''),
  });
});

authRouter.post('/giris', requireGuest, (req, res) => {
  const key = rateLimitKey(req, 'login');
  if (isRateLimited(key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW)) {
    res.status(429).render('auth/login', {
      title: 'Giriş yap',
      errors: { _form: 'Çok fazla başarısız deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' },
      values: { email: formString(req.body.email) },
      next: safeRedirect(req.query.next, ''),
    });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).render('auth/login', {
      title: 'Giriş yap',
      errors: zodFieldErrors(parsed.error),
      values: { email: formString(req.body.email) },
      next: safeRedirect(req.query.next, ''),
    });
    return;
  }

  const user = findUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    registerRateLimitFailure(key, LOGIN_WINDOW);
    res.status(400).render('auth/login', {
      title: 'Giriş yap',
      errors: { _form: 'E-posta adresi veya şifre hatalı.' },
      values: { email: parsed.data.email },
      next: safeRedirect(req.query.next, ''),
    });
    return;
  }

  if (user.status === 'suspended') {
    registerRateLimitFailure(key, LOGIN_WINDOW);
    res.status(403).render('auth/login', {
      title: 'Giriş yap',
      errors: {
        _form: 'Hesabınız askıya alınmış. Lütfen kütüphane yöneticisiyle iletişime geçin.',
      },
      values: { email: parsed.data.email },
      next: safeRedirect(req.query.next, ''),
    });
    return;
  }

  clearRateLimit(key);
  cleanupSessions();
  const session = createSession(user.id);
  res.cookie(config.cookieName, session.token, cookieOptions(config.sessionDays * 86_400));

  if (user.status === 'pending') {
    setFlash(
      res,
      'info',
      'Giriş yaptınız. Üyeliğiniz yönetici onayı bekliyor; onaylandığında kitap ödünç alabilirsiniz.',
    );
  } else {
    setFlash(res, 'success', `Hoş geldiniz, ${user.full_name.split(' ')[0]}.`);
  }

  const target = safeRedirect(req.query.next, loginRedirectFor(user.role));
  res.redirect(target);
});

authRouter.get('/kayit', requireGuest, (req, res) => {
  res.render('auth/register', {
    title: 'Üye ol',
    errors: {},
    values: { full_name: '', email: '', phone: '', address: '' },
  });
});

authRouter.post('/kayit', requireGuest, (req, res) => {
  const key = rateLimitKey(req, 'register');
  if (isRateLimited(key, 5, 60 * 60 * 1000)) {
    res.status(429).render('auth/register', {
      title: 'Üye ol',
      errors: { _form: 'Çok fazla kayıt denemesi yapıldı. Lütfen daha sonra tekrar deneyin.' },
      values: {
        full_name: formString(req.body.full_name),
        email: formString(req.body.email),
        phone: formString(req.body.phone),
        address: formString(req.body.address),
      },
    });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  const errors = parsed.success ? {} : zodFieldErrors(parsed.error);

  if (!parsed.success) {
    registerRateLimitFailure(key, 60 * 60 * 1000);
    res.status(400).render('auth/register', {
      title: 'Üye ol',
      errors,
      values: {
        full_name: formString(req.body.full_name),
        email: formString(req.body.email),
        phone: formString(req.body.phone),
        address: formString(req.body.address),
      },
    });
    return;
  }

  if (formString(req.body.password_confirm) !== parsed.data.password) {
    errors.password_confirm = 'Şifreler birbiriyle eşleşmiyor.';
  }
  if (formString(req.body.terms) !== 'on') {
    errors.terms = 'Üyelik koşullarını kabul etmeniz gerekir.';
  }

  if (findUserByEmail(parsed.data.email)) {
    errors.email = 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.';
  }

  if (Object.keys(errors).length > 0) {
    registerRateLimitFailure(key, 60 * 60 * 1000);
    res.status(400).render('auth/register', {
      title: 'Üye ol',
      errors,
      values: {
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? '',
        address: parsed.data.address ?? '',
      },
    });
    return;
  }

  createUser({
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    address: parsed.data.address,
    password_hash: hashPassword(parsed.data.password),
    role: 'member',
    status: 'pending',
  });

  clearRateLimit(key);
  setFlash(
    res,
    'success',
    'Kaydınız alındı. Yönetici üyeliğinizi onayladıktan sonra giriş yapıp kitap ödünç alabilirsiniz.',
  );
  res.redirect('/giris');
});

authRouter.post('/cikis', (req, res) => {
  const token = req.cookies[config.cookieName];
  if (token) deleteSession(token);
  res.clearCookie(config.cookieName, { path: '/' });
  setFlash(res, 'info', 'Çıkış yaptınız.');
  res.redirect('/');
});
