import { Router } from 'express';
import {
  approveRequest,
  closeRequest,
  findApprovedRequestForCopy,
  getRequestWithDetails,
  searchRequests,
} from '../../repos/requests.js';
import { createLoan } from '../../repos/loans.js';
import { listAvailableCopies } from '../../repos/books.js';
import { getSettingInt } from '../../repos/settings.js';
import { requestApproveSchema, requestCloseSchema } from '../../lib/validation.js';
import { formString, notFound, safeRedirect, validateId, zodFieldErrors } from '../../lib/http.js';
import { paginate, parsePage } from '../../lib/pagination.js';
import { setFlash } from '../../lib/flash.js';
import { logAudit } from '../../repos/audit.js';
import { addDays, todayIso } from '../../lib/dates.js';

export const adminRequestsRouter = Router();

adminRequestsRouter.get('/talepler', (req, res) => {
  const filterParam = formString(req.query.durum);
  const filter =
    filterParam === 'pending' ||
    filterParam === 'approved' ||
    filterParam === 'closed' ||
    filterParam === 'all'
      ? filterParam
      : 'open';

  const page = parsePage(req.query.sayfa);
  const { requests, total } = searchRequests({ filter, page, perPage: 20 });
  const pagination = paginate({ page, perPage: 20, total });

  const copiesByBook: Record<number, ReturnType<typeof listAvailableCopies>> = {};
  for (const request of requests) {
    if (request.status === 'pending' && !copiesByBook[request.book_id]) {
      copiesByBook[request.book_id] = listAvailableCopies(request.book_id);
    }
  }

  res.render('admin/requests/index', {
    title: 'Ödünç talepleri',
    requests,
    total,
    filter,
    pagination,
    copiesByBook,
    activeAdmin: 'talepler',
  });
});

adminRequestsRouter.post('/talepler/:id/onayla', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/talepler');
    const parsed = requestApproveSchema.safeParse(req.body);

    if (!parsed.success) {
      setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Talep onaylanamadı.');
      res.redirect(back);
      return;
    }

    try {
      approveRequest(id, parsed.data.copy_id, req.user!.id, parsed.data.admin_note ?? null);
      logAudit(req.user!.id, 'request.approve', 'borrow_request', id, {
        copy_id: parsed.data.copy_id,
      });
      setFlash(
        res,
        'success',
        'Talep onaylandı ve kitap rezerve edildi. Kitap elden teslim edildiğinde "Teslim et" işlemini yapın.',
      );
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'Talep onaylanamadı.');
    }

    res.redirect(back);
  } catch (error) {
    next(error);
  }
});

adminRequestsRouter.post('/talepler/:id/reddet', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/talepler');
    const parsed = requestCloseSchema.safeParse(req.body);

    try {
      closeRequest(id, 'rejected', req.user!.id, parsed.success ? parsed.data.admin_note ?? null : null);
      logAudit(req.user!.id, 'request.reject', 'borrow_request', id);
      setFlash(res, 'success', 'Talep reddedildi.');
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'Talep reddedilemedi.');
    }

    res.redirect(back);
  } catch (error) {
    next(error);
  }
});

adminRequestsRouter.post('/talepler/:id/iptal', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/talepler');
    const parsed = requestCloseSchema.safeParse(req.body);

    try {
      closeRequest(id, 'cancelled', req.user!.id, parsed.success ? parsed.data.admin_note ?? null : null);
      logAudit(req.user!.id, 'request.cancel', 'borrow_request', id);
      setFlash(res, 'success', 'Talep iptal edildi; rezerve kopya varsa yeniden müsait duruma alındı.');
    } catch (error) {
      setFlash(res, 'error', error instanceof Error ? error.message : 'Talep iptal edilemedi.');
    }

    res.redirect(back);
  } catch (error) {
    next(error);
  }
});

adminRequestsRouter.post('/talepler/:id/teslim', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const back = safeRedirect(req.body.return_to, '/admin/talepler');
    const request = getRequestWithDetails(id);
    if (!request) throw notFound('Talep bulunamadı.');

    if (request.status !== 'approved' || !request.copy_id) {
      setFlash(res, 'error', 'Yalnızca onaylanmış ve kopyası rezerve edilmiş talepler teslim edilebilir.');
      res.redirect(back);
      return;
    }

    const reservedRequest = findApprovedRequestForCopy(request.copy_id);
    if (reservedRequest?.id !== request.id) {
      setFlash(res, 'error', 'Bu talep için ayrılmış kopya artık geçerli değil. Lütfen talebi yeniden onaylayın.');
      res.redirect(back);
      return;
    }

    const dueDays = getSettingInt('loan_days', 21);
    const dueAt = addDays(todayIso(), dueDays);
    const loanId = createLoan({
      copy_id: request.copy_id,
      book_id: request.book_id,
      user_id: request.user_id,
      request_id: request.id,
      loaned_by: req.user!.id,
      due_at: dueAt,
      notes: request.member_note,
    });

    logAudit(req.user!.id, 'request.fulfill', 'borrow_request', id, {
      loan_id: loanId,
      due_at: dueAt,
    });
    setFlash(res, 'success', `Kitap teslim edildi. Teslim tarihi: ${dueAt}.`);
    res.redirect(back);
  } catch (error) {
    next(error);
  }
});
