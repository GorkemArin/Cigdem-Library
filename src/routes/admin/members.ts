import { Router } from 'express';
import {
  countAdmins,
  getPublicUserById,
  searchMembers,
  setUserRole,
  setUserStatus,
} from '../../repos/users.js';
import { memberRoleSchema, memberStatusSchema } from '../../lib/validation.js';
import { formString, notFound, safeRedirect, validateId, zodFieldErrors } from '../../lib/http.js';
import { paginate, parsePage } from '../../lib/pagination.js';
import { setFlash } from '../../lib/flash.js';
import { logAudit } from '../../repos/audit.js';

export const adminMembersRouter = Router();

adminMembersRouter.get('/uyeler', (req, res) => {
  const q = formString(req.query.q);
  const statusParam = formString(req.query.durum);
  const roleParam = formString(req.query.rol);
  const status =
    statusParam === 'pending' || statusParam === 'active' || statusParam === 'suspended'
      ? statusParam
      : 'all';
  const role = roleParam === 'admin' || roleParam === 'member' ? roleParam : 'all';
  const page = parsePage(req.query.sayfa);

  const { members, total } = searchMembers({
    q: q || undefined,
    status,
    role,
    page,
    perPage: 20,
  });
  const pagination = paginate({ page, perPage: 20, total });

  res.render('admin/members/index', {
    title: 'Üyeler',
    members,
    total,
    q,
    status,
    role,
    pagination,
    activeAdmin: 'uyeler',
  });
});

adminMembersRouter.post('/uyeler/:id/durum', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const target = getPublicUserById(id);
    if (!target) throw notFound('Üye bulunamadı.');

    const back = safeRedirect(req.body.return_to, '/admin/uyeler');

    if (target.id === req.user!.id) {
      setFlash(res, 'error', 'Kendi üyelik durumunuzu değiştiremezsiniz.');
      res.redirect(back);
      return;
    }

    const parsed = memberStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Durum güncellenemedi.');
      res.redirect(back);
      return;
    }

    if (
      parsed.data.status === 'suspended' &&
      target.role === 'admin' &&
      target.status === 'active' &&
      countAdmins() <= 1
    ) {
      setFlash(res, 'error', 'Son aktif yöneticiyi askıya alamazsınız.');
      res.redirect(back);
      return;
    }

    setUserStatus(id, parsed.data.status);
    logAudit(req.user!.id, 'member.status', 'user', id, {
      from: target.status,
      to: parsed.data.status,
    });

    const message =
      parsed.data.status === 'active'
        ? `${target.full_name} üyeliği onaylandı.`
        : `${target.full_name} üyeliği askıya alındı.`;
    setFlash(res, 'success', message);
    res.redirect(back);
  } catch (error) {
    next(error);
  }
});

adminMembersRouter.post('/uyeler/:id/rol', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const target = getPublicUserById(id);
    if (!target) throw notFound('Üye bulunamadı.');

    const back = safeRedirect(req.body.return_to, '/admin/uyeler');

    if (target.id === req.user!.id) {
      setFlash(res, 'error', 'Kendi rolünüzü değiştiremezsiniz.');
      res.redirect(back);
      return;
    }

    const parsed = memberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(res, 'error', 'Geçersiz rol.');
      res.redirect(back);
      return;
    }

    if (parsed.data.role === 'admin' && target.status !== 'active') {
      setFlash(res, 'error', 'Yönetici yapmadan önce üyeliğin aktif olması gerekir.');
      res.redirect(back);
      return;
    }

    if (
      parsed.data.role === 'member' &&
      target.role === 'admin' &&
      countAdmins() <= 1
    ) {
      setFlash(res, 'error', 'Son aktif yöneticinin rolünü düşüremezsiniz.');
      res.redirect(back);
      return;
    }

    setUserRole(id, parsed.data.role);
    logAudit(req.user!.id, 'member.role', 'user', id, {
      from: target.role,
      to: parsed.data.role,
    });
    setFlash(
      res,
      'success',
      parsed.data.role === 'admin'
        ? `${target.full_name} artık yönetici.`
        : `${target.full_name} artık standart üye.`,
    );
    res.redirect(back);
  } catch (error) {
    next(error);
  }
});
