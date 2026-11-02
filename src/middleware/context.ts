import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { getSettings } from '../repos/settings.js';
import { getSessionUser } from '../lib/sessions.js';
import { cookieOptions, parseCookies, randomToken, safeEqual } from '../lib/security.js';
import { readFlash } from '../lib/flash.js';
import { HttpError } from '../lib/http.js';
import {
  addDays,
  dueInfo,
  formatDate,
  formatDateTime,
  formatShortDate,
  isOverdue,
  todayIso,
} from '../lib/dates.js';
import { formatIsbn } from '../lib/isbn.js';
import { pageQuery } from '../lib/pagination.js';
import { countPendingRequests } from '../repos/requests.js';
import { countOverdueLoans } from '../repos/loans.js';
import { countPendingMembers } from '../repos/users.js';
import {
  CONDITION_OPTIONS,
  COPY_STATUS_OPTIONS,
  LANGUAGE_OPTIONS,
  conditionInfo,
  copyStatusInfo,
  languageLabel,
  requestStatusInfo,
  roleInfo,
  userStatusInfo,
} from '../lib/labels.js';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.cookies = parseCookies(req.headers.cookie);

  let csrfToken = req.cookies[config.csrfCookieName];
  if (!csrfToken) {
    csrfToken = randomToken(24);
    res.cookie(config.csrfCookieName, csrfToken, cookieOptions(config.sessionDays * 86_400));
  }

  const token = req.cookies[config.cookieName];
  if (token) {
    const user = getSessionUser(token);
    if (user) {
      req.user = user;
    } else {
      res.clearCookie(config.cookieName, { path: '/' });
    }
  }

  res.locals.csrfToken = csrfToken;
  res.locals.flash = readFlash(req.cookies[config.flashCookieName], res);
  res.locals.currentUser = req.user ?? null;
  res.locals.settings = getSettings();
  res.locals.adminCounts =
    req.user?.role === 'admin'
      ? {
          pendingRequests: countPendingRequests(),
          overdueLoans: countOverdueLoans(),
          pendingMembers: countPendingMembers(),
        }
      : null;
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.currentYear = new Date().getFullYear();

  res.locals.formatDate = formatDate;
  res.locals.formatShortDate = formatShortDate;
  res.locals.formatDateTime = formatDateTime;
  res.locals.todayIso = todayIso;
  res.locals.addDays = addDays;
  res.locals.dueInfo = dueInfo;
  res.locals.isOverdue = isOverdue;
  res.locals.formatIsbn = formatIsbn;
  res.locals.pageQuery = pageQuery;

  res.locals.copyStatus = copyStatusInfo;
  res.locals.condition = conditionInfo;
  res.locals.requestStatus = requestStatusInfo;
  res.locals.userStatus = userStatusInfo;
  res.locals.roleInfo = roleInfo;
  res.locals.languageLabel = languageLabel;
  res.locals.LANGUAGE_OPTIONS = LANGUAGE_OPTIONS;
  res.locals.COPY_STATUS_OPTIONS = COPY_STATUS_OPTIONS;
  res.locals.CONDITION_OPTIONS = CONDITION_OPTIONS;

  next();
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const cookieToken = req.cookies[config.csrfCookieName];
  const submitted = typeof req.body?._csrf === 'string' ? req.body._csrf : '';

  if (!cookieToken || !submitted || !safeEqual(cookieToken, submitted)) {
    next(
      new HttpError(
        403,
        'Form oturumunuzun süresi dolmuş veya istek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
      ),
    );
    return;
  }

  next();
}
