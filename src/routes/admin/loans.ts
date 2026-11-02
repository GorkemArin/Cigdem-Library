import { Router } from 'express';
import {
  createLoan,
  getLoanById,
  listAvailableCopiesForLoan,
  renewLoan,
  returnLoan,
  searchLoans,
} from '../../repos/loans.js';
import { getCopyById } from '../../repos/books.js';
import { getPublicUserById, listActiveMembers } from '../../repos/users.js';
import { getSettingInt } from '../../repos/settings.js';
import { manualLoanSchema } from '../../lib/validation.js';
import { formString, notFound, safeRedirect, validateId, zodFieldErrors } from '../../lib/http.js';
import { paginate, parsePage } from '../../lib/pagination.js';
import { setFlash } from '../../lib/flash.js';
import { logAudit } from '../../repos/audit.js';
import { addDays, todayIso } from '../../lib/dates.js';

export const adminLoansRouter = Router();

adminLoansRouter.get('/oduncler', (req, res) => {
  const filterParam = formString(req.query.durum);
  const filter =
    filterParam === 'overdue' ||
    filterParam === 'returned' ||
    filterParam === 'all'
      ? filterParam
      : 'active';
  const q = formString(req.query.q);
  const page = parsePage(req.query.sayfa);

  const { loans, total } = searchLoans({ filter, q: q || undefined, page, perPage: 20 });
  const pagination = paginate({ page, perPage: 20, total });

  res.render('admin/loans/index', {
    title: 'Ödünçler',
    loans,
    total,
    filter,
    q,
    pagination,
    members: listActiveMembers(),
    availableCopies: listAvailableCopiesForLoan(),
    defaultDueDate: addDays(todayIso(), getSettingInt('loan_days', 21)),
    activeAdmin: 'oduncler',
  });
});

adminLoansRouter.post('/oduncler/yeni', (req, res, next) => {
  try {
    const back = safeRedirect(req.body.return_to, '/admin/oduncler');
    const parsed = manualLoanSchema.safeParse(req.body);

    if (!parsed.success) {
      setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Ödünç kaydı oluşturulamadı.');
      res.redirect(back);
      return;
    }

    const copy = getCopyById(parsed.data.copy_id);
    if (!copy) throw notFound('Kopya bulunamadı.');

    const member = getPublicUserById(parsed.data.user_id);
    if (!member) throw notFound('Üye bulunamadı.');

    const dueAt = addDays(todayIso(), getSettingInt('loan_days', 21));
    const loanId = createLoan({
      copy_id: copy.id,
      book_id: copy.book_id,
      user_id: member.id,
      loaned_by: req.user!.id,
      due_at: dueAt,
      notes: parsed.data.notes ?? null,
    });

    logAudit(req.user!.id, 'loan.create', 'loan', loanId, {
      copy_id: copy.id,
      user_id: member.id,
      due_at: dueAt,
    });
    setFlash(res, 'success', `Ödünç kaydı oluşturuldu. Teslim tarihi: ${dueAt}.`);
    res.redirect(back);
  } catch (error) {
    setFlash(res, 'error', error instanceof Error ? error.message : 'Ödünç kaydı oluşturulamadı.');
    res.redirect(safeRedirect(req.body.return_to, '/admin/oduncler'));
  }
});

adminLoansRouter.post('/oduncler/:id/iade', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/oduncler');
    const loan = getLoanById(id);
    if (!loan) throw notFound('Ödünç kaydı bulunamadı.');

    try {
      returnLoan(id, req.user!.id);
      logAudit(req.user!.id, 'loan.return', 'loan', id, {
        copy_id: loan.copy_id,
        user_id: loan.user_id,
      });
      setFlash(res, 'success', 'Kitap iade alındı ve kopya yeniden müsait duruma alındı.');
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'İade işlemi yapılamadı.');
    }

    res.redirect(back);
  } catch (error) {
    next(error);
  }
});

adminLoansRouter.post('/oduncler/:id/uzat', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/oduncler');
    const loan = getLoanById(id);
    if (!loan) throw notFound('Ödünç kaydı bulunamadı.');

    try {
      const updated = renewLoan(
        id,
        getSettingInt('renew_days', 14),
        getSettingInt('max_renewals', 1),
      );
      logAudit(req.user!.id, 'loan.renew', 'loan', id, {
        old_due_at: loan.due_at,
        new_due_at: updated.due_at,
      });
      setFlash(res, 'success', `Ödünç süresi uzatıldı. Yeni teslim tarihi: ${updated.due_at}.`);
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'Ödünç süresi uzatılamadı.');
    }

    res.redirect(back);
  } catch (error) {
    next(error);
  }
});
