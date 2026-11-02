import { Router } from 'express';
import { requireAuth, requireActiveMember } from '../middleware/auth.js';
import {
  countActiveLoansForUser,
  countOverdueLoansForUser,
  findActiveLoanForUserBook,
  listUserLoans,
} from '../repos/loans.js';
import {
  cancelOwnRequest,
  countOpenRequestsForUser,
  createRequest,
  findOpenRequestForUserBook,
  listUserRequests,
} from '../repos/requests.js';
import { getBookWithStock } from '../repos/books.js';
import { findUserById, updatePassword, updateProfile } from '../repos/users.js';
import { getSettingInt } from '../repos/settings.js';
import { hashPassword, verifyPassword } from '../lib/security.js';
import { passwordSchema, profileSchema, requestSchema } from '../lib/validation.js';
import { formString, notFound, validateId, zodFieldErrors } from '../lib/http.js';
import { setFlash } from '../lib/flash.js';
import { deleteOtherSessions } from '../lib/sessions.js';
import { logAudit } from '../repos/audit.js';
import { config } from '../config.js';

export const accountRouter = Router();

accountRouter.get('/hesabim', requireAuth, (req, res) => {
  const user = req.user!;
  if (user.role === 'admin') {
    res.redirect('/admin');
    return;
  }

  const activeLoans = listUserLoans(user.id).filter((loan) => !loan.returned_at);
  const history = listUserLoans(user.id).filter((loan) => loan.returned_at);
  const requests = listUserRequests(user.id);
  const openRequests = requests.filter(
    (request) => request.status === 'pending' || request.status === 'approved',
  );

  res.render('account/dashboard', {
    title: 'Hesabım',
    activeLoans,
    history,
    requests,
    openRequests,
    activeCount: countActiveLoansForUser(user.id),
    overdueCount: countOverdueLoansForUser(user.id),
    openRequestCount: countOpenRequestsForUser(user.id),
    maxLoans: getSettingInt('max_active_loans', 3),
  });
});

accountRouter.get('/hesabim/profil', requireAuth, (req, res) => {
  const user = req.user!;
  res.render('account/profile', {
    title: 'Profil bilgilerim',
    errors: {},
    values: {
      full_name: user.full_name,
      phone: user.phone ?? '',
      address: user.address ?? '',
    },
  });
});

accountRouter.post('/hesabim/profil', requireAuth, (req, res) => {
  const user = req.user!;
  const parsed = profileSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).render('account/profile', {
      title: 'Profil bilgilerim',
      errors: zodFieldErrors(parsed.error),
      values: {
        full_name: formString(req.body.full_name),
        phone: formString(req.body.phone),
        address: formString(req.body.address),
      },
    });
    return;
  }

  updateProfile(user.id, parsed.data);
  logAudit(user.id, 'profile.update', 'user', user.id);
  setFlash(res, 'success', 'Profil bilgileriniz güncellendi.');
  res.redirect('/hesabim/profil');
});

accountRouter.post('/hesabim/sifre', requireAuth, (req, res) => {
  const user = req.user!;
  const parsed = passwordSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Şifre güncellenemedi.');
    res.redirect('/hesabim/profil');
    return;
  }

  const dbUser = findUserById(user.id);
  if (!dbUser || !verifyPassword(parsed.data.current_password, dbUser.password_hash)) {
    setFlash(res, 'error', 'Mevcut şifreniz hatalı.');
    res.redirect('/hesabim/profil');
    return;
  }

  if (formString(req.body.new_password_confirm) !== parsed.data.new_password) {
    setFlash(res, 'error', 'Yeni şifreler birbiriyle eşleşmiyor.');
    res.redirect('/hesabim/profil');
    return;
  }

  updatePassword(user.id, hashPassword(parsed.data.new_password));
  const token = req.cookies[config.cookieName];
  if (token) deleteOtherSessions(user.id, token);
  logAudit(user.id, 'profile.password_change', 'user', user.id);
  setFlash(res, 'success', 'Şifreniz güncellendi. Diğer cihazlardaki oturumlar kapatıldı.');
  res.redirect('/hesabim/profil');
});

accountRouter.post('/hesabim/talepler', requireActiveMember, (req, res) => {
  const user = req.user!;
  const parsed = requestSchema.safeParse(req.body);

  if (!parsed.success) {
    setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Talep oluşturulamadı.');
    res.redirect('/kitaplar');
    return;
  }

  const book = getBookWithStock(parsed.data.book_id);
  if (!book) throw notFound('Kitap bulunamadı.');

  if (book.available_copies < 1) {
    setFlash(res, 'error', 'Bu kitabın müsait kopyası kalmamış. Lütfen daha sonra tekrar deneyin.');
    res.redirect(`/kitaplar/${book.id}`);
    return;
  }

  if (findActiveLoanForUserBook(user.id, book.id)) {
    setFlash(res, 'error', 'Bu kitabın bir kopyası zaten sizde. İade ettikten sonra tekrar talep edebilirsiniz.');
    res.redirect(`/kitaplar/${book.id}`);
    return;
  }

  if (findOpenRequestForUserBook(user.id, book.id)) {
    setFlash(res, 'info', 'Bu kitap için zaten açık bir talebiniz var.');
    res.redirect(`/kitaplar/${book.id}`);
    return;
  }

  const maxLoans = getSettingInt('max_active_loans', 3);
  const current = countActiveLoansForUser(user.id) + countOpenRequestsForUser(user.id);
  if (current >= maxLoans) {
    setFlash(
      res,
      'error',
      `Aynı anda en fazla ${maxLoans} açık ödünç/talep hakkınız var. Önce mevcut kitaplarınızı iade edin.`,
    );
    res.redirect(`/kitaplar/${book.id}`);
    return;
  }

  const requestId = createRequest(user.id, book.id, parsed.data.member_note ?? null);
  logAudit(user.id, 'request.create', 'borrow_request', requestId, { book_id: book.id });
  setFlash(
    res,
    'success',
    'Ödünç talebiniz alındı. Kütüphane yöneticisi onayladığında kitabı elden teslim alabilirsiniz.',
  );
  res.redirect(`/kitaplar/${book.id}`);
});

accountRouter.post('/hesabim/talepler/:id/iptal', requireAuth, (req, res) => {
  const user = req.user!;
  const id = validateId(req.params.id);

  try {
    cancelOwnRequest(id, user.id);
    logAudit(user.id, 'request.cancel', 'borrow_request', id);
    setFlash(res, 'success', 'Talebiniz iptal edildi.');
  } catch (error) {
    setFlash(res, 'error', error instanceof Error ? error.message : 'Talep iptal edilemedi.');
  }

  res.redirect('/hesabim');
});
