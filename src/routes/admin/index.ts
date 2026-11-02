import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { getDashboardStats, getMonthlyLoans } from '../../repos/stats.js';
import { listRecentRequests } from '../../repos/requests.js';
import { listRecentLoans, popularBooks, searchLoans } from '../../repos/loans.js';
import { listAudit } from '../../repos/audit.js';
import { getSettings, updateSettings } from '../../repos/settings.js';
import { auditActionLabel } from '../../lib/labels.js';
import { settingsSchema } from '../../lib/validation.js';
import { zodFieldErrors, formString } from '../../lib/http.js';
import { setFlash } from '../../lib/flash.js';
import { logAudit } from '../../repos/audit.js';
import { adminBooksRouter } from './books.js';
import { adminMembersRouter } from './members.js';
import { adminRequestsRouter } from './requests.js';
import { adminLoansRouter } from './loans.js';
import { adminOpenLibraryRouter } from './openlibrary.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get('/', (req, res) => {
  const overdue = searchLoans({ filter: 'overdue', page: 1, perPage: 5 });

  res.render('admin/dashboard', {
    title: 'Yönetim paneli',
    stats: getDashboardStats(),
    recentRequests: listRecentRequests(7),
    recentLoans: listRecentLoans(6),
    overdueLoans: overdue.loans,
    popular: popularBooks(5),
    monthlyLoans: getMonthlyLoans(6),
    recentAudit: listAudit(8).map((entry) => ({
      ...entry,
      action_label: auditActionLabel(entry.action),
    })),
    activeAdmin: 'panel',
  });
});

adminRouter.get('/ayarlar', (req, res) => {
  res.render('admin/settings', {
    title: 'Ayarlar',
    values: getSettings(),
    errors: {},
    activeAdmin: 'ayarlar',
  });
});

adminRouter.post('/ayarlar', (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);

  if (!parsed.success) {
    const values = { ...getSettings() };
    for (const key of [
      'library_name',
      'loan_days',
      'renew_days',
      'max_renewals',
      'max_active_loans',
      'hold_days',
      'fine_per_day',
      'contact_email',
      'contact_phone',
    ]) {
      values[key] = formString(req.body[key]);
    }

    res.status(400).render('admin/settings', {
      title: 'Ayarlar',
      values,
      errors: zodFieldErrors(parsed.error),
      activeAdmin: 'ayarlar',
    });
    return;
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    values[key] = value === undefined || value === null ? '' : String(value);
  }

  updateSettings(values);
  logAudit(req.user!.id, 'settings.update', 'settings', null, values);
  setFlash(res, 'success', 'Kütüphane ayarları güncellendi.');
  res.redirect('/admin/ayarlar');
});

adminRouter.get('/kayitlar', (req, res) => {
  const entries = listAudit(200).map((entry) => ({
    ...entry,
    action_label: auditActionLabel(entry.action),
  }));

  res.render('admin/audit', {
    title: 'İşlem kayıtları',
    entries,
    activeAdmin: 'kayitlar',
  });
});

adminRouter.use(adminBooksRouter);
adminRouter.use(adminMembersRouter);
adminRouter.use(adminRequestsRouter);
adminRouter.use(adminLoansRouter);
adminRouter.use(adminOpenLibraryRouter);
